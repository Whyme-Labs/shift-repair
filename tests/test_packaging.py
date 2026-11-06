from __future__ import annotations

import shutil
import subprocess
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scripts.release_check import REQUIRED, ReleaseError, export_source, main, source_zip
from shiftrepair.api import create_app


def commit_fixture(root: Path) -> None:
    subprocess.run(["git", "add", "."], cwd=root, check=True, capture_output=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.name=Release test",
            "-c",
            "user.email=release@example.invalid",
            "commit",
            "-m",
            "Release fixture",
        ],
        cwd=root,
        check=True,
        capture_output=True,
    )


def source_fixture(root: Path) -> None:
    root.mkdir()
    subprocess.run(["git", "init", "-q", str(root)], check=True, capture_output=True)
    for name in REQUIRED:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"source fixture for {name}\n")
    (root / ".gitignore").write_text(
        ".venv/\nnode_modules/\ndesktop/preview/\n.runtime/\n.env\n__pycache__/\n"
    )
    (root / "notes.md").write_text("committed\n")
    commit_fixture(root)


def test_clean_export_distinguishes_commit_from_worktree_and_has_stable_zip(tmp_path: Path) -> None:
    root = tmp_path / "repo"
    source_fixture(root)
    for name in (
        ".venv/secret",
        "desktop/node_modules/dependency",
        "desktop/preview/stale.js",
        ".runtime/board.db",
        ".env",
        "shiftrepair/__pycache__/api.pyc",
    ):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("must not be released")
    (root / "notes.md").write_text("working copy\n")
    (root / "new-doc.md").write_text("new source\n")

    committed, working = tmp_path / "committed", tmp_path / "working"
    first = export_source(root, committed, "HEAD")
    second = export_source(root, working, None)
    assert (committed / "notes.md").read_text() == "committed\n"
    assert (working / "notes.md").read_text() == "working copy\n"
    assert not (committed / "new-doc.md").exists()
    assert (working / "new-doc.md").exists()
    assert first["mode"] == "commit" and second["mode"] == "worktree"
    assert first["source_sha256"] != second["source_sha256"]
    assert not any(
        "must not be released" in path.read_text() for path in working.rglob("*") if path.is_file()
    )
    for name in ("one.zip", "two.zip"):
        source_zip(working, tmp_path / name, second)
    assert (tmp_path / "one.zip").read_bytes() == (tmp_path / "two.zip").read_bytes()
    with zipfile.ZipFile(tmp_path / "one.zip") as archive:
        assert set("shiftrepair/" + name for name in REQUIRED).issubset(archive.namelist())


def test_release_rejects_accidentally_tracked_runtime_data(tmp_path: Path) -> None:
    root = tmp_path / "repo"
    source_fixture(root)
    (root / ".env").write_text("fixture only")
    subprocess.run(["git", "add", "-f", ".env"], cwd=root, check=True, capture_output=True)
    commit_fixture(root)
    with pytest.raises(ReleaseError, match="Environment file"):
        export_source(root, tmp_path / "export", "HEAD")


def test_worktree_export_cannot_follow_a_parent_link_outside_the_repository(tmp_path: Path) -> None:
    root = tmp_path / "repo"
    source_fixture(root)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "manifest.json").write_text("must not be copied")
    shutil.rmtree(root / "dashboard")
    (root / "dashboard").symlink_to(outside, target_is_directory=True)
    # Hide the new directory entry from Git's untracked list while its formerly
    # tracked children remain listed. This exercises the ancestor, not the leaf.
    with (root / ".gitignore").open("a") as ignored:
        ignored.write("/dashboard\n")
    with pytest.raises(ReleaseError, match="escapes the repository"):
        export_source(root, tmp_path / "export", None)
    assert not (tmp_path / "export").exists()


def test_release_check_never_overwrites_an_existing_output(tmp_path: Path) -> None:
    report = tmp_path / "report.json"
    report.write_text("existing evidence")
    assert main(["--output", str(tmp_path)]) == 1
    assert report.read_text() == "existing evidence"


def test_source_preview_and_explicit_asset_override_are_served(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    with TestClient(create_app(tmp_path / "source-data")) as client:
        response = client.get("/")
        assert response.headers["content-type"].startswith("text/html")
        assert response.content == (root / "preview/index.html").read_bytes()
        assert client.get("/app.js").content == (root / "preview/app.js").read_bytes()
    custom = tmp_path / "custom-preview"
    custom.mkdir()
    (custom / "index.html").write_text("<html>Explicit preview</html>")
    with TestClient(create_app(tmp_path / "custom-data", custom)) as client:
        assert client.get("/").text == "<html>Explicit preview</html>"
        assert client.get("/api/plugins/shiftrepair/board").json() == {"board": None}
