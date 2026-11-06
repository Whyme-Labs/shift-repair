"""Run a localhost preview or inspect a stored project."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .api import create_app
from .errors import ServiceError
from .service import RosterService


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="shiftrepair")
    parser.add_argument(
        "--data-dir", type=Path, default=Path.home() / ".local" / "share" / "shiftrepair",
        help="Directory for this standalone preview's database, separate from Hermes profiles",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    serve = commands.add_parser("serve", help="Start the local preview")
    serve.add_argument("--port", type=int, default=8787)
    serve.add_argument("--preview-dir", type=Path, default=None)
    commands.add_parser("board", help="Print current board JSON")
    demo = commands.add_parser("demo", help="Load the example, preserving undo history")
    demo.add_argument("--confirm-reset", action="store_true", required=True)
    export = commands.add_parser("export", help="Print a validated schedule or project CSV")
    export.add_argument("--kind", choices=["schedule", "project"], default="schedule")
    args = parser.parse_args(argv)
    if args.command == "serve":
        if not 1 <= args.port <= 65535:
            parser.error("port must be between 1 and 65535")
        try:
            import uvicorn
        except ImportError:
            parser.error("Install the preview extra: pip install -e '.[preview]'")
        uvicorn.run(create_app(args.data_dir, args.preview_dir), host="127.0.0.1", port=args.port)
        return 0
    service = RosterService(args.data_dir)
    try:
        if args.command == "demo":
            print(json.dumps({"board": service.load_demo()}, indent=2))
        elif args.command == "board":
            print(json.dumps({"board": service.get_board()}, indent=2))
        else:
            print(service.export_csv(args.kind)["content"], end="")
    except ServiceError as exc:
        print(json.dumps({"error": {"code": exc.code, "message": exc.message}}))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
