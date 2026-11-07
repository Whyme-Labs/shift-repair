#!/usr/bin/env python3
"""Export, rebuild, package and exercise ShiftRepair outside its source checkout.

Requires Git, uv and npm. Runs no Hermes admission or external publishing action.
All dependency installs and generated build files stay in a temporary directory.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

ASSETS = ("desktop/plugin.js", "preview/index.html", "preview/app.js")
REQUIRED = (
    *ASSETS,
    "plugin.yaml",
    "__init__.py",
    "dashboard/manifest.json",
    "dashboard/plugin_api.py",
    "shiftrepair/__init__.py",
    "pyproject.toml",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "desktop/package-lock.json",
)
EXCLUDED_PARTS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".runtime",
    ".test-build",
    "build",
    "dist",
    "artifacts",
}
EXCLUDED_SUFFIXES = (
    ".pyc",
    ".pyo",
    ".db",
    ".db-shm",
    ".db-wal",
    ".sqlite3",
    ".sqlite3-shm",
    ".sqlite3-wal",
)
PREFIX = "/api/plugins/shiftrepair"


class ReleaseError(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ReleaseError(message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def check_path(name: str, *, distribution: bool = False) -> None:
    path = PurePosixPath(name)
    require(
        bool(path.parts) and not path.is_absolute() and ".." not in path.parts,
        f"Unsafe archive path: {name}",
    )
    require(not EXCLUDED_PARTS.intersection(path.parts), f"Excluded release content: {name}")
    require("desktop/preview" not in str(path), f"Obsolete preview output: {name}")
    require(not path.name.startswith(".env"), f"Environment file in release: {name}")
    require(not name.endswith(EXCLUDED_SUFFIXES), f"Runtime file in release: {name}")
    if not distribution:
        require(
            not any(part.endswith(".egg-info") for part in path.parts),
            f"Build metadata in source release: {name}",
        )


def git(root: Path, *args: str) -> bytes:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        check=True,
        capture_output=True,
    ).stdout


def export_source(root: Path, destination: Path, ref: str | None) -> dict[str, Any]:
    """Export a Git revision, or explicit current unignored working-tree bytes."""
    require(not destination.exists(), f"Source destination already exists: {destination}")
    entries: list[tuple[str, bytes, int]] = []
    commit = git(root, "rev-parse", "--verify", f"{ref or 'HEAD'}^{{commit}}").decode().strip()
    if ref is not None:
        with tarfile.open(fileobj=io.BytesIO(git(root, "archive", "--format=tar", commit))) as tf:
            for member in tf.getmembers():
                if member.isdir():
                    continue
                check_path(member.name)
                require(
                    member.isfile(),
                    f"Release links and special files are unsupported: {member.name}",
                )
                stream = tf.extractfile(member)
                require(stream is not None, f"Cannot read {member.name}")
                entries.append((member.name, stream.read(), member.mode))
    else:
        names = git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
        for raw in sorted(set(names.split(b"\0")) - {b""}):
            name = os.fsdecode(raw)
            check_path(name)
            path = root / name
            require(not path.is_symlink(), f"Release symlink is unsupported: {name}")
            require(
                path.resolve().is_relative_to(root.resolve()),
                f"Release path escapes the repository: {name}",
            )
            if not path.exists():
                continue  # A tracked deletion is part of the working-tree snapshot.
            require(path.is_file(), f"Release special file is unsupported: {name}")
            entries.append((name, path.read_bytes(), path.stat().st_mode))
    names = {entry[0] for entry in entries}
    require(
        set(REQUIRED).issubset(names),
        f"Required release files missing: {sorted(set(REQUIRED) - names)}",
    )
    destination.mkdir(parents=True)
    files = []
    for name, content, mode in sorted(entries):
        path = destination / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        mode = 0o755 if mode & 0o111 else 0o644
        path.chmod(mode)
        files.append({"path": name, "sha256": sha256(content), "bytes": len(content), "mode": mode})
    digest = sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode())
    return {
        "mode": "commit" if ref else "worktree",
        "base_commit": commit,
        "source_sha256": digest,
        "files": files,
    }


def source_zip(source: Path, target: Path, manifest: dict[str, Any]) -> None:
    """Fixed metadata makes the source ZIP depend only on selected file bytes/modes."""
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for entry in manifest["files"]:
            info = zipfile.ZipInfo("shiftrepair/" + entry["path"], (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100000 | entry["mode"]) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, (source / entry["path"]).read_bytes())


class Runner:
    def __init__(self, logs: Path, env: dict[str, str]):
        self.logs, self.env = logs, env
        self.commands: list[dict[str, Any]] = []
        logs.mkdir()

    def run(self, label: str, command: list[str], cwd: Path, timeout: int = 300) -> str:
        print(label, flush=True)
        result = subprocess.run(
            command,
            cwd=cwd,
            env=self.env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
        )
        (self.logs / f"{label}.log").write_text(result.stdout)
        self.commands.append({"step": label, "command": command, "exit_code": result.returncode})
        require(
            result.returncode == 0,
            f"{label} failed. See {self.logs / (label + '.log')}\n{result.stdout[-2500:]}",
        )
        return result.stdout


def verify_distributions(source: Path, sdist: Path, wheel: Path) -> dict[str, str]:
    with tarfile.open(sdist) as tf:
        for member in tf.getmembers():
            check_path(member.name, distribution=True)
            require(member.isdir() or member.isfile(), f"Unexpected sdist link: {member.name}")
    with zipfile.ZipFile(wheel) as archive:
        for name in archive.namelist():
            check_path(name, distribution=True)
        for filename in ("index.html", "app.js"):
            expected = (source / "preview" / filename).read_bytes()
            require(
                archive.read(f"shiftrepair/_preview/{filename}") == expected,
                f"Wheel is missing the exact preview asset: {filename}",
            )
        for filename in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
            matches = [
                name for name in archive.namelist() if name.endswith("/licenses/" + filename)
            ]
            require(len(matches) == 1, f"Wheel is missing license file: {filename}")
            require(
                archive.read(matches[0]) == (source / filename).read_bytes(),
                f"License mismatch: {filename}",
            )
        metadata = archive.read(
            next(name for name in archive.namelist() if name.endswith("/METADATA"))
        ).decode()
        uvicorn = [
            line for line in metadata.splitlines() if line.startswith("Requires-Dist: uvicorn")
        ]
        require(
            bool(uvicorn) and all("extra ==" in line for line in uvicorn),
            "uvicorn must stay optional",
        )
    return {path.name: sha256(path.read_bytes()) for path in (sdist, wheel)}


def installed_smoke(
    runner: Runner, temp: Path, wheel: Path, source: Path, python: str
) -> dict[str, Any]:
    env_dir = temp / "installed"
    runner.run("create-venv", ["uv", "venv", "--python", python, str(env_dir)], temp)
    bin_dir = env_dir / ("Scripts" if os.name == "nt" else "bin")
    executable = str(bin_dir / ("python.exe" if os.name == "nt" else "python"))
    cli = str(bin_dir / ("shiftrepair.exe" if os.name == "nt" else "shiftrepair"))
    runner.run(
        "install-base-wheel", ["uv", "pip", "install", "--python", executable, str(wheel)], temp
    )
    origin = json.loads(
        runner.run(
            "check-isolated-import",
            [
                executable,
                "-c",
                (
                    "import importlib.util,json,shiftrepair; print(json.dumps({"
                    "'module':shiftrepair.__file__,'uvicorn_present':importlib.util.find_spec('uvicorn') is not None}))"
                ),
            ],
            temp,
        )
    )
    require(
        Path(origin["module"]).is_relative_to(env_dir), "Import escaped the installed environment"
    )
    require(not origin["uvicorn_present"], "Base install unexpectedly requires uvicorn")
    empty = json.loads(
        runner.run("base-cli-board", [cli, "--data-dir", str(temp / "board"), "board"], temp)
    )
    require(empty == {"board": None}, "Base CLI requires the optional server or has unexpected state")
    missing = subprocess.run(
        [cli, "--data-dir", str(temp / "board"), "serve"],
        cwd=temp,
        env=runner.env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=15,
    )
    (runner.logs / "missing-preview-extra.log").write_text(missing.stdout)
    require(
        missing.returncode == 2 and "[preview]" in missing.stdout,
        "Missing preview extra is not explained",
    )
    runner.run(
        "install-preview-extra",
        ["uv", "pip", "install", "--python", executable, f"{wheel}[preview]"],
        temp,
    )
    runner.run("dependency-check", ["uv", "pip", "check", "--python", executable], temp)
    runner.run("installed-dependencies", ["uv", "pip", "freeze", "--python", executable], temp)
    runtime = json.loads(
        runner.run(
            "installed-runtime",
            [
                executable,
                "-c",
                (
                    "import importlib.metadata as m,json,platform,time; "
                    "started=time.monotonic(); from ortools.sat.python import cp_model; "
                    "print(json.dumps({'python':platform.python_version(),"
                    "'solver_import_seconds':time.monotonic()-started,"
                    "'packages':{name:m.version(name) for name in ['hermes-shiftrepair','ortools','pydantic','fastapi','uvicorn']}}))"
                ),
            ],
            temp,
        )
    )
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base_url = f"http://127.0.0.1:{port}"

    def request(path: str, body: dict[str, Any] | None = None) -> tuple[bytes, str]:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            base_url + path, data=data, headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.read(), response.headers.get("Content-Type", "")

    def api(path: str, body: dict[str, Any] | None = None) -> Any:
        return json.loads(request(PREFIX + path, body)[0])

    print("installed-http-smoke", flush=True)
    server_log = runner.logs / "installed-server.log"
    with server_log.open("w") as log:
        server = subprocess.Popen(
            [cli, "--data-dir", str(temp / "board"), "serve", "--port", str(port)],
            cwd=temp,
            env=runner.env,
            stdout=log,
            stderr=log,
        )
        try:
            deadline = time.monotonic() + 30
            while True:
                require(server.poll() is None, f"Installed server exited. See {server_log}")
                try:
                    html, content_type = request("/")
                    break
                except urllib.error.URLError:
                    require(
                        time.monotonic() < deadline,
                        f"Installed server did not start. See {server_log}",
                    )
                    time.sleep(0.1)
            require(content_type.startswith("text/html"), "Installed preview did not serve HTML")
            require(
                html == (source / "preview/index.html").read_bytes(),
                "Installed index differs from release",
            )
            require(
                request("/app.js")[0] == (source / "preview/app.js").read_bytes(),
                "Installed JS differs from release",
            )
            require(api("/board") == {"board": None}, "Fresh environment has unexpected state")
            original = api("/demo", {})["board"]
            edited = api(
                "/changes",
                {
                    "expected_revision": original["revision"],
                    "changes": [
                        {
                            "type": "availability",
                            "person_id": "asha",
                            "date": "2026-11-09",
                            "available": False,
                        }
                    ],
                },
            )["board"]
            require(bool(edited["validation"]), "Demo absence did not invalidate baseline")
            solved = api("/solve", {"expected_revision": edited["revision"]})["board"]
            result = solved["candidate"]["result"]
            require(
                result["status"] == "OPTIMAL" and result["changed_assignments"] == 2,
                "Installed solver failed expected repair",
            )
            require(
                solved["roster"]["baseline"] == original["roster"]["baseline"],
                "Solve changed the baseline before apply",
            )
            applied = api(
                "/apply",
                {
                    "expected_revision": solved["revision"],
                    "candidate_id": solved["candidate"]["id"],
                },
            )["board"]
            require(
                not applied["validation"] and applied["candidate"] is None,
                "Applied repair did not validate",
            )
            require(
                applied["roster"]["baseline"] == result["assignment"],
                "Applied state differs from candidate",
            )
            require(
                len(api("/export")["content"].splitlines()) == 29,
                "Installed schedule export failed",
            )
            require(
                api("/export?kind=project")["content"].startswith("record_type,"),
                "Installed project export failed",
            )
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
    persisted = json.loads(
        runner.run(
            "installed-cli-persistence", [cli, "--data-dir", str(temp / "board"), "board"], temp
        )
    )["board"]
    require(persisted == applied, "CLI did not read the HTTP server's persisted board")
    return {
        **runtime,
        "module_origin": origin["module"],
        "uvicorn_optional": True,
        "html_and_js_match_release": True,
        "solver_status": result["status"],
        "changed_assignments": result["changed_assignments"],
        "violations_after_apply": 0,
        "baseline_unchanged_until_apply": True,
        "schedule_and_project_export": True,
        "cli_persistence": True,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--ref", default="HEAD", help="Git commit/ref to export, default HEAD")
    selection.add_argument(
        "--worktree",
        action="store_true",
        help="Explicitly check current unignored files, including uncommitted changes",
    )
    parser.add_argument(
        "--output", type=Path, required=True, help="New output directory outside the repository"
    )
    parser.add_argument(
        "--python", default=sys.executable, help="Python 3.12 to 3.14 for the fresh installation"
    )
    args = parser.parse_args(argv)
    if Path(args.python).is_file():
        args.python = str(Path(args.python).absolute())
    root = Path(__file__).resolve().parent.parent
    output = args.output.resolve()
    report: dict[str, Any] = {"status": "failed"}
    created_output = False
    try:
        require(not output.exists(), f"Output already exists: {output}")
        require(
            not output.is_relative_to(root), "Place release output outside the source repository"
        )
        for command in ("git", "uv", "npm"):
            require(shutil.which(command) is not None, f"Required command unavailable: {command}")
        output.mkdir(parents=True)
        created_output = True
        source = output / "source"
        manifest = export_source(root, source, None if args.worktree else args.ref)
        (output / "source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        report["source"] = {key: value for key, value in manifest.items() if key != "files"}
        report["source"]["files"] = len(manifest["files"])
        env = {
            key: value
            for key, value in os.environ.items()
            if key not in {"PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"}
        }
        env["SOURCE_DATE_EPOCH"] = (
            git(root, "show", "-s", "--format=%ct", manifest["base_commit"]).decode().strip()
        )
        runner = Runner(output / "logs", env)
        report["commands"] = runner.commands
        report["toolchain"] = {
            name: runner.run(f"version-{name}", [name, "--version"], output).strip()
            for name in ("uv", "node", "npm")
        }
        with tempfile.TemporaryDirectory(prefix="shiftrepair-release-") as temp_name:
            temp = Path(temp_name)
            build = temp / "build-source"
            shutil.copytree(source, build)
            runner.run(
                "frontend-install", ["npm", "ci", "--no-audit", "--no-fund"], build / "desktop"
            )
            runner.run("frontend-build", ["npm", "run", "build"], build / "desktop")
            for name in ASSETS:
                require(
                    (build / name).read_bytes() == (source / name).read_bytes(),
                    f"Checked-in bundle is stale: {name}. Rebuild in desktop and retry.",
                )
            report["rebuilt_assets_match"] = list(ASSETS)
            dist = output / "dist"
            # Build Python from the clean export, without frontend-installed dependencies.
            package_source = temp / "package-source"
            shutil.copytree(source, package_source)
            runner.run(
                "build-sdist",
                ["uv", "build", "--sdist", "--out-dir", str(dist), str(package_source)],
                temp,
            )
            sdist = next(dist.glob("*.tar.gz"))
            runner.run(
                "build-wheel-from-sdist",
                ["uv", "build", "--wheel", "--out-dir", str(dist), str(sdist)],
                temp,
            )
            wheel = next(dist.glob("*.whl"))
            report["distribution_sha256"] = verify_distributions(source, sdist, wheel)
            report["installed_smoke"] = installed_smoke(runner, temp, wheel, source, args.python)
        archive = output / "shiftrepair-source.zip"
        source_zip(source, archive, manifest)
        report["source_zip_sha256"] = sha256(archive.read_bytes())
        checksums = [f"{report['source_zip_sha256']}  {archive.name}"]
        checksums += [
            f"{digest}  dist/{name}" for name, digest in report["distribution_sha256"].items()
        ]
        (output / "SHA256SUMS").write_text("\n".join(checksums) + "\n")
        report["status"] = "passed"
        print(f"Release check passed: {output}", flush=True)
        return 0
    except (ReleaseError, OSError, subprocess.SubprocessError, KeyError, StopIteration) as exc:
        report["error"] = str(exc)
        print(f"Release check failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if created_output:
            (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
