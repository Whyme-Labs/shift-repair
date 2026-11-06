"""Portable project CSV and readable schedule CSV, with formula-safe cells."""

from __future__ import annotations

import csv
import io
import json
import re
from typing import Any

from pydantic import ValidationError

from .errors import ServiceError
from .models import MAX_PEOPLE, MAX_SLOTS, Roster

MAX_CSV_BYTES = 1_048_576
PROJECT_COLUMNS = [
    "record_type", "id", "name", "week_start", "roles", "available_days",
    "max_assignments", "date", "shift", "role", "assignee", "pin",
]
SCHEDULE_COLUMNS = ["date", "shift", "role", "person_id", "name", "pinned"]
_FORMULA_PREFIXES = "'=+-@\t\r\n"


def _escape(value: Any) -> str:
    text = str(value)
    return "'" + text if text and text[0] in _FORMULA_PREFIXES else text


def _unescape(value: str) -> str:
    # Escape apostrophes too: a round trip never loses a legitimate leading quote.
    if len(value) > 1 and value[0] == "'" and value[1] in _FORMULA_PREFIXES:
        return value[1:]
    return value


def _write(columns: list[str], rows: list[dict[str, Any]]) -> str:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: _escape(value) for key, value in row.items()})
    return output.getvalue()


def export_schedule(roster: Roster) -> str:
    people = {person.id: person for person in roster.people}
    rows = []
    for slot in sorted(roster.slots, key=lambda item: (item.date, item.shift, item.role, item.id)):
        person_id = roster.baseline[slot.id]
        rows.append({
            "date": slot.date,
            "shift": slot.shift,
            "role": slot.role,
            "person_id": person_id,
            "name": people[person_id].name,
            "pinned": "true" if slot.id in roster.pins else "false",
        })
    return _write(SCHEDULE_COLUMNS, rows)


def export_project(roster: Roster) -> str:
    rows: list[dict[str, Any]] = [{
        "record_type": "roster", "name": roster.name, "week_start": roster.week_start,
    }]
    for person in roster.people:
        rows.append({
            "record_type": "person",
            "id": person.id,
            "name": person.name,
            "roles": json.dumps(person.roles, ensure_ascii=False),
            "available_days": json.dumps(person.available_days),
            "max_assignments": person.max_assignments,
        })
    for slot in roster.slots:
        rows.append({
            "record_type": "slot", "id": slot.id, "date": slot.date,
            "shift": slot.shift, "role": slot.role, "assignee": roster.baseline[slot.id],
            "pin": roster.pins.get(slot.id, ""),
        })
    return _write(PROJECT_COLUMNS, rows)


def import_project(content: str) -> Roster:
    if not isinstance(content, str):
        raise ServiceError("invalid_csv", "Project CSV must be text no larger than 1 MiB.")
    try:
        content_bytes = len(content.encode("utf-8"))
    except UnicodeEncodeError as exc:
        raise ServiceError("invalid_csv", "Project CSV must contain valid Unicode text.") from exc
    if content_bytes > MAX_CSV_BYTES:
        raise ServiceError("invalid_csv", "Project CSV must be text no larger than 1 MiB.")
    try:
        reader = csv.DictReader(io.StringIO(content.removeprefix("\ufeff"), newline=""), strict=True)
        if reader.fieldnames != PROJECT_COLUMNS:
            raise ServiceError(
                "invalid_csv",
                "Use the full project CSV format. A schedule export lacks availability and rules.",
            )
        metadata: dict[str, str] | None = None
        people: list[dict[str, Any]] = []
        slots: list[dict[str, str]] = []
        baseline: dict[str, str] = {}
        pins: dict[str, str] = {}
        allowed = {
            "roster": {"record_type", "name", "week_start"},
            "person": {
                "record_type", "id", "name", "roles", "available_days", "max_assignments",
            },
            "slot": {"record_type", "id", "date", "shift", "role", "assignee", "pin"},
        }
        for index, raw in enumerate(reader, start=2):
            if index > MAX_PEOPLE + MAX_SLOTS + 2:
                raise ServiceError("invalid_csv", "Project CSV has too many records.")
            if None in raw or any(value is None for value in raw.values()):
                raise ServiceError("invalid_csv", f"Row {index} has the wrong number of cells.")
            row = {key: _unescape(value) for key, value in raw.items()}
            kind = row["record_type"]
            if kind not in allowed:
                raise ServiceError("invalid_csv", f"Row {index} has an unsupported record_type.")
            if any(value for key, value in row.items() if key not in allowed[kind]):
                raise ServiceError("invalid_csv", f"Row {index} has data in an unsupported column.")
            if kind == "roster":
                if metadata is not None:
                    raise ServiceError("invalid_csv", "Project CSV needs exactly one roster row.")
                metadata = {"name": row["name"], "week_start": row["week_start"]}
            elif kind == "person":
                if not re.fullmatch(r"[0-7]", row["max_assignments"]):
                    raise ServiceError("invalid_csv", f"Row {index} needs a capacity from 0 to 7.")
                people.append({
                    "id": row["id"], "name": row["name"],
                    "roles": json.loads(row["roles"]),
                    "available_days": json.loads(row["available_days"]),
                    "max_assignments": int(row["max_assignments"]),
                })
            else:
                slots.append({key: row[key] for key in ("id", "date", "shift", "role")})
                baseline[row["id"]] = row["assignee"]
                if row["pin"]:
                    pins[row["id"]] = row["pin"]
        if metadata is None:
            raise ServiceError("invalid_csv", "Project CSV needs exactly one roster row.")
        return Roster.model_validate({
            **metadata, "people": people, "slots": slots, "baseline": baseline, "pins": pins,
        })
    except (csv.Error, json.JSONDecodeError, RecursionError, ValidationError) as exc:
        if isinstance(exc, ValidationError):
            detail = exc.errors(include_input=False, include_url=False)[0]["msg"]
        else:
            detail = "Check CSV quoting and the JSON arrays for roles and available_days."
        raise ServiceError("invalid_csv", f"Invalid project CSV. {detail}") from exc
