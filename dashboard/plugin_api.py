"""Native Hermes Desktop REST mount at /api/plugins/shiftrepair.

Hermes loads this file directly. Its package dependencies are installed from
the root pyproject.toml by the plugin package manager before activation.
"""

from typing import Any

from hermes_cli.plugin_events import broadcast_plugin_event
from plugins.plugin_storage import plugin_data_dir

from shiftrepair.api import create_router
from shiftrepair.service import RosterService


def _board_updated(board: dict[str, Any]) -> None:
    broadcast_plugin_event("shiftrepair", "board.updated", {"revision": board["revision"]})


def service() -> RosterService:
    # Resolve every request: the server can multiplex multiple Hermes profiles.
    return RosterService(plugin_data_dir("shiftrepair"), on_change=_board_updated)


router = create_router(service)
