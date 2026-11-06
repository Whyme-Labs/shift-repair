"""Hermes directory-plugin entrypoint for ShiftRepair.

The installable ``shiftrepair`` package owns all state and scheduling logic.
This module only validates tool arguments and delegates to that shared service.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError

from shiftrepair.models import Roster
from shiftrepair.service import Edits, RosterService, ServiceError

logger = logging.getLogger(__name__)
PLUGIN_ID = "shiftrepair"


class Arguments(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class EmptyArguments(Arguments):
    pass


class DemoArguments(Arguments):
    confirm_reset: StrictBool = Field(
        description="Must be true. Replaces the current board with the example and keeps undo history."
    )


class RevisionArguments(Arguments):
    expected_revision: int = Field(ge=1, description="The exact revision returned by get_board.")


class ImportRosterArguments(Arguments):
    roster: Roster
    expected_revision: int | None = Field(
        default=None, ge=1, description="Required to replace an existing board."
    )


class ChangeArguments(RevisionArguments):
    changes: Edits


class CandidateArguments(RevisionArguments):
    candidate_id: str = Field(min_length=1, max_length=128)


class ExportArguments(Arguments):
    kind: Literal["schedule", "project"] = Field(
        default="schedule",
        description="schedule is the human-readable roster; project preserves all inputs for reimport.",
    )


class ImportCsvArguments(Arguments):
    content: str = Field(min_length=1, max_length=262144)
    expected_revision: int | None = Field(
        default=None, ge=1, description="Required to replace an existing board."
    )


def _board_updated(board: dict[str, Any]) -> None:
    # Events contain no roster names or staff data. The active profile's REST
    # request fetches its own board after receiving this invalidation signal.
    from hermes_cli.plugin_events import broadcast_plugin_event

    broadcast_plugin_event(PLUGIN_ID, "board.updated", {"revision": board["revision"]})


def _service() -> RosterService:
    # Hermes resolves the active profile on each call. Never cache this path.
    from plugins.plugin_storage import plugin_data_dir

    return RosterService(plugin_data_dir(PLUGIN_ID), on_change=_board_updated)


def _run_demo(service: RosterService, arguments: DemoArguments) -> dict[str, Any]:
    if not arguments.confirm_reset:
        return {"ok": False, "error": {"code": "confirmation_required", "message":
                "Loading the example replaces the board. Pass confirm_reset=true to proceed."}}
    return {"ok": True, "board": service.load_demo()}


def _tool_handler(
    argument_type: type[Arguments],
    operation: Callable[[RosterService, Any], dict[str, Any]],
) -> Callable[..., str]:
    def handle(arguments: dict[str, Any], **kwargs: Any) -> str:
        """Hermes supplies one arguments dict and optional host context keywords."""
        try:
            validated = argument_type.model_validate(arguments)
            result = operation(_service(), validated)
        except ValidationError as exc:
            issues = [
                {"path": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
                for error in exc.errors(include_input=False, include_url=False)[:12]
            ]
            result = {"ok": False, "error": {"code": "invalid_arguments", "message":
                      "Tool arguments failed validation.", "issues": issues}}
        except ServiceError as exc:
            result = {"ok": False, "error": {"code": exc.code, "message": exc.message}}
        except Exception:
            logger.exception("ShiftRepair tool failed")
            result = {"ok": False, "error": {"code": "internal_error", "message":
                      "ShiftRepair could not complete the operation. Check the plugin log."}}
        return json.dumps(result, ensure_ascii=False, allow_nan=False)

    return handle


# Named tools keep proposed repairs and applied schedules separate. A successful
# solve only stores a candidate; applying requires its ID and the latest revision.
TOOL_DEFINITIONS: tuple[tuple[str, str, type[Arguments], Callable[..., dict[str, Any]]], ...] = (
    (
        "shiftrepair_get_board",
        "Read the active profile's roster, revision, independent validation, candidate and history. "
        "Read before editing so expected_revision protects concurrent human changes.",
        EmptyArguments,
        lambda service, args: {"ok": True, "board": service.get_board()},
    ),
    (
        "shiftrepair_load_demo",
        "Load the 8-person example. This explicitly replaces the active board and preserves undo "
        "history. Only call after the user asks to load or reset the demo.",
        DemoArguments,
        _run_demo,
    ),
    (
        "shiftrepair_import_roster",
        "Create or replace the weekly roster from explicit structured input. Supports one location, "
        "at most 32 people and 126 slots, one assignment per person per day. Never invent availability. "
        "Replacing a board requires its current expected_revision.",
        ImportRosterArguments,
        lambda service, args: {"ok": True, "board": service.import_roster(
            args.roster, expected_revision=args.expected_revision)},
    ),
    (
        "shiftrepair_change",
        "Record availability, capacity or pin changes, or add a person. This changes constraints, "
        "invalidates any previous candidate, and leaves the baseline assignment unchanged. "
        "A missing availability day means unavailable. Then call solve for a repair proposal.",
        ChangeArguments,
        lambda service, args: {"ok": True, "board": service.change(
            args.expected_revision, [change.model_dump(mode="json") for change in args.changes])},
    ),
    (
        "shiftrepair_solve",
        "Propose a repair that minimizes changed assignments while satisfying the stated rules. "
        "Does not apply it. Only status OPTIMAL proves the fewest changes; FEASIBLE is an unproven "
        "candidate, UNKNOWN proves nothing, INFEASIBLE reports a sufficient conflicting set. "
        "Inspect independent validation and show the proposed changes before applying.",
        RevisionArguments,
        lambda service, args: {"ok": True, "board": service.solve(args.expected_revision)},
    ),
    (
        "shiftrepair_apply",
        "Apply the exact stored candidate after the user accepts the proposal. Requires its ID "
        "and current board revision. Rechecks every rule before writing the new baseline.",
        CandidateArguments,
        lambda service, args: {"ok": True, "board": service.apply(
            args.expected_revision, args.candidate_id)},
    ),
    (
        "shiftrepair_discard",
        "Discard a stored candidate without changing the baseline. Requires its ID and current revision.",
        CandidateArguments,
        lambda service, args: {"ok": True, "board": service.discard(
            args.expected_revision, args.candidate_id)},
    ),
    (
        "shiftrepair_undo",
        "Restore the previous board content as a new audited revision. Does not delete history.",
        RevisionArguments,
        lambda service, args: {"ok": True, "board": service.undo(args.expected_revision)},
    ),
    (
        "shiftrepair_export",
        "Return CSV text and filename for the independently valid baseline. Does not write an arbitrary "
        "path or send the roster to anyone. Use kind=project for a full project roundtrip; "
        "kind=schedule is a human-readable handoff.",
        ExportArguments,
        lambda service, args: {"ok": True, **service.export_csv(kind=args.kind)},
    ),
    (
        "shiftrepair_import_csv",
        "Import the full ShiftRepair project CSV, including explicit people, availability, slots and "
        "baseline. A schedule-only CSV is not sufficient. Replace only with the current revision. "
        "Reads supplied text, never filesystem paths.",
        ImportCsvArguments,
        lambda service, args: {"ok": True, "board": service.import_csv(
            args.content, expected_revision=args.expected_revision)},
    ),
)


def register(ctx: Any) -> None:
    """Register through Hermes's documented PluginContext surface, with no I/O."""
    for name, description, argument_type, operation in TOOL_DEFINITIONS:
        ctx.register_tool(
            name=name,
            toolset=PLUGIN_ID,
            schema={
                "name": name,
                "description": description,
                "parameters": argument_type.model_json_schema(),
            },
            handler=_tool_handler(argument_type, operation),
            description=description,
        )
