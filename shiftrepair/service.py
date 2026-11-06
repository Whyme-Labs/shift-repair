"""One application boundary shared by Desktop, agent tools and the local preview."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import date, timedelta
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import Field, TypeAdapter, ValidationError

from . import csv_io, solver
from .checker import check
from .errors import ServiceError
from .examples import demo_roster
from .models import Identifier, IsoDate, Person, Roster, SolveResult, StrictModel
from .storage import State, Store

logger = logging.getLogger(__name__)
Json = dict[str, Any]


class AvailabilityChange(StrictModel):
    type: Literal["availability"]
    person_id: Identifier
    date: IsoDate
    available: bool


class PinChange(StrictModel):
    type: Literal["pin"]
    slot_id: Identifier
    person_id: Identifier | None


class CapacityChange(StrictModel):
    type: Literal["capacity"]
    person_id: Identifier
    max_assignments: int = Field(ge=0, le=7)


class AddPersonChange(StrictModel):
    type: Literal["add_person"]
    person: Person


Edit = Annotated[
    AvailabilityChange | PinChange | CapacityChange | AddPersonChange,
    Field(discriminator="type"),
]
Edits = Annotated[list[Edit], Field(min_length=1, max_length=64)]
_edits = TypeAdapter(Edits)


def _invalid(exc: ValidationError) -> ServiceError:
    error = exc.errors(include_input=False, include_url=False)[0]
    location = ".".join(str(part) for part in error["loc"])
    message = f"{location}: {error['msg']}" if location else error["msg"]
    return ServiceError("invalid_input", message)


def _revision(value: int | None, *, optional: bool = False) -> None:
    if value is None and optional:
        return
    if type(value) is not int or value < 1:
        raise ServiceError("invalid_revision", "expected_revision must be a positive integer.")


class RosterService:
    def __init__(
        self, data_dir: Path, on_change: Callable[[Json], None] | None = None
    ) -> None:
        self.store = Store(Path(data_dir))
        self.on_change = on_change

    def _view(self, state: State) -> Json:
        roster = Roster.model_validate(state.roster)
        return {
            "id": state.id,
            "revision": state.revision,
            "can_undo": state.can_undo,
            "roster": roster.model_dump(mode="json"),
            "validation": [item.model_dump(mode="json") for item in check(roster, roster.baseline)],
            "candidate": state.candidate,
            "history": state.history,
        }

    def _changed(self, state: State) -> Json:
        board = self._view(state)
        if self.on_change is not None:
            try:
                self.on_change(board)
            except Exception:
                # The database already committed. Notification failure must not
                # encourage the caller to repeat a successful mutation.
                logger.exception("Schedule saved, but the board update notification failed")
        return board

    def get_board(self) -> Json | None:
        state = self.store.get()
        return self._view(state) if state else None

    def load_demo(self) -> Json:
        return self._changed(self.store.replace(
            demo_roster().model_dump(mode="json"), "Loaded example", reset=True
        ))

    def import_roster(self, roster: Roster | Json, expected_revision: int | None = None) -> Json:
        _revision(expected_revision, optional=True)
        try:
            validated = Roster.model_validate(roster)
        except ValidationError as exc:
            raise _invalid(exc) from exc
        return self._changed(self.store.replace(
            validated.model_dump(mode="json"), "Imported project", expected_revision
        ))

    def change(self, expected_revision: int, changes: list[Json]) -> Json:
        _revision(expected_revision)
        try:
            edits = _edits.validate_python(changes)
        except ValidationError as exc:
            raise _invalid(exc) from exc

        def transform(state: State) -> Json:
            data = state.roster
            people = {person["id"]: person for person in data["people"]}
            slot_ids = {slot["id"] for slot in data["slots"]}
            start = date.fromisoformat(data["week_start"])
            days = {(start + timedelta(days=offset)).isoformat() for offset in range(7)}
            for edit in edits:
                if isinstance(edit, AddPersonChange):
                    if edit.person.id in people:
                        raise ServiceError("duplicate_person", "That person ID already exists.")
                    person = edit.person.model_dump(mode="json")
                    data["people"].append(person)
                    people[person["id"]] = person
                elif isinstance(edit, PinChange):
                    if edit.slot_id not in slot_ids:
                        raise ServiceError("unknown_slot", "That position does not exist.")
                    if edit.person_id is None:
                        data["pins"].pop(edit.slot_id, None)
                    elif edit.person_id not in people:
                        raise ServiceError("unknown_person", "That person does not exist.")
                    else:
                        data["pins"][edit.slot_id] = edit.person_id
                else:
                    if edit.person_id not in people:
                        raise ServiceError("unknown_person", "That person does not exist.")
                    person = people[edit.person_id]
                    if isinstance(edit, CapacityChange):
                        person["max_assignments"] = edit.max_assignments
                    else:
                        if edit.date not in days:
                            raise ServiceError("outside_week", "Availability must be within this week.")
                        available = set(person["available_days"])
                        if edit.available:
                            available.add(edit.date)
                        else:
                            available.discard(edit.date)
                        person["available_days"] = sorted(available)
            try:
                return Roster.model_validate(data).model_dump(mode="json")
            except ValidationError as exc:
                raise _invalid(exc) from exc

        return self._changed(self.store.mutate(
            expected_revision, transform, f"Updated {len(edits)} rule{'s' if len(edits) != 1 else ''}"
        ))

    def solve(self, expected_revision: int) -> Json:
        _revision(expected_revision)
        state = self.store.get()
        if state is None:
            raise ServiceError("board_missing", "Load an example or import a project first.", 404)
        if state.revision != expected_revision:
            raise ServiceError("stale_revision", "The schedule changed. Refresh before solving.", 409)
        result = solver.solve(Roster.model_validate(state.roster))
        # Save checks again after the solver returns. A concurrent edit wins.
        return self._changed(self.store.save_candidate(
            expected_revision, result.model_dump(mode="json")
        ))

    def apply(self, expected_revision: int, candidate_id: str) -> Json:
        _revision(expected_revision)

        def transform(state: State) -> Json:
            candidate = self.store.require_candidate(state, candidate_id)
            try:
                result = SolveResult.model_validate(candidate["result"])
            except ValidationError as exc:
                raise ServiceError(
                    "invalid_repair", "The stored repair is invalid. Solve and review again."
                ) from exc
            if result.status not in {"OPTIMAL", "FEASIBLE"} or result.assignment is None:
                raise ServiceError("repair_unresolved", "This result has no valid repair to apply.")
            roster = Roster.model_validate(state.roster)
            violations = check(roster, result.assignment)
            if violations:
                raise ServiceError("invalid_repair", "The repair failed independent validation.")
            actual_changes = {
                (slot_id, old, result.assignment[slot_id])
                for slot_id, old in roster.baseline.items()
                if result.assignment[slot_id] != old
            }
            reported_changes = {
                (change.slot_id, change.from_person_id, change.to_person_id)
                for change in result.changes
            }
            if actual_changes != reported_changes:
                raise ServiceError(
                    "invalid_repair",
                    "The stored change list does not match this schedule. Solve and review again.",
                )
            data = roster.model_dump(mode="json")
            data["baseline"] = result.assignment
            return Roster.model_validate(data).model_dump(mode="json")

        return self._changed(self.store.mutate(expected_revision, transform, "Applied reviewed repair"))

    def discard(self, expected_revision: int, candidate_id: str) -> Json:
        _revision(expected_revision)
        return self._changed(self.store.discard(expected_revision, candidate_id))

    def undo(self, expected_revision: int) -> Json:
        _revision(expected_revision)
        return self._changed(self.store.undo(expected_revision))

    def export_csv(self, kind: str = "schedule") -> Json:
        if kind not in {"schedule", "project"}:
            raise ServiceError("invalid_export_kind", "Choose schedule or project CSV.")
        state = self.store.get()
        if state is None:
            raise ServiceError("board_missing", "Load an example or import a project first.", 404)
        roster = Roster.model_validate(state.roster)
        if check(roster, roster.baseline):
            raise ServiceError(
                "invalid_schedule", "The current schedule breaks its rules. Apply a valid repair first."
            )
        content = (
            csv_io.export_schedule(roster) if kind == "schedule" else csv_io.export_project(roster)
        )
        return {
            "filename": f"shiftrepair-{roster.week_start}-{kind}-r{state.revision}.csv",
            "content": content,
            "mime_type": "text/csv;charset=utf-8",
        }

    def import_csv(self, content: str, expected_revision: int | None = None) -> Json:
        return self.import_roster(csv_io.import_project(content), expected_revision)
