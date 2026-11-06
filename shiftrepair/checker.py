"""Independent, plain-Python validation of a proposed assignment.

This module deliberately has no OR-Tools or solver import. It checks the actual
assignment against accepted facts, including when imported or stored output is
corrupt. The same check is used before a candidate can be applied or exported.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping

from .models import Roster, Violation


def check(roster: Roster, assignment: Mapping[str, str]) -> list[Violation]:
    """Return every supported constraint violation, without repairing anything."""
    if not isinstance(assignment, Mapping):
        return [
            Violation(
                code="invalid_assignment", message="Assignment must map slot IDs to person IDs."
            )
        ]

    violations: list[Violation] = []
    slots = {slot.id: slot for slot in roster.slots}
    people = {person.id: person for person in roster.people}
    per_person: dict[str, list[str]] = defaultdict(list)
    per_day: dict[tuple[str, str], list[str]] = defaultdict(list)

    missing = sorted(set(slots) - set(assignment))
    if missing:
        violations.append(
            Violation(
                code="missing_slot",
                message=f"{len(missing)} required position(s) have no assignment.",
                slot_ids=missing,
            )
        )

    for slot_id, person_id in assignment.items():
        if not isinstance(slot_id, str) or not isinstance(person_id, str):
            violations.append(
                Violation(
                    code="invalid_assignment_type",
                    message="Every assignment key and value must be a string ID.",
                    slot_ids=[slot_id] if isinstance(slot_id, str) else [],
                    person_ids=[person_id] if isinstance(person_id, str) else [],
                )
            )
            continue
        if slot_id not in slots:
            violations.append(
                Violation(
                    code="unknown_slot",
                    message=f"Assignment references an unknown position: {slot_id[:120]}.",
                    slot_ids=[slot_id],
                    person_ids=[person_id],
                )
            )
            continue
        if person_id not in people:
            violations.append(
                Violation(
                    code="unknown_person",
                    message=f"Position {slot_id} references an unknown person: {person_id[:120]}.",
                    slot_ids=[slot_id],
                    person_ids=[person_id],
                )
            )
            continue

        slot, person = slots[slot_id], people[person_id]
        per_person[person_id].append(slot_id)
        per_day[person_id, slot.date].append(slot_id)
        if slot.role not in person.roles:
            violations.append(
                Violation(
                    code="unqualified",
                    message=f"{person.name} is not qualified for {slot.role} at {slot_id}.",
                    slot_ids=[slot_id],
                    person_ids=[person_id],
                )
            )
        if slot.date not in person.available_days:
            violations.append(
                Violation(
                    code="unavailable",
                    message=f"{person.name} is unavailable on {slot.date}, required by {slot_id}.",
                    slot_ids=[slot_id],
                    person_ids=[person_id],
                )
            )

    for (person_id, day), slot_ids in sorted(per_day.items()):
        if len(slot_ids) > 1:
            violations.append(
                Violation(
                    code="daily_capacity",
                    message=(
                        f"{people[person_id].name} has {len(slot_ids)} assignments on {day}; "
                        "the daily maximum is 1."
                    ),
                    slot_ids=slot_ids,
                    person_ids=[person_id],
                )
            )
    for person_id, slot_ids in sorted(per_person.items()):
        person = people[person_id]
        if len(slot_ids) > person.max_assignments:
            violations.append(
                Violation(
                    code="weekly_capacity",
                    message=(
                        f"{person.name} has {len(slot_ids)} assignments; "
                        f"their accepted weekly maximum is {person.max_assignments}."
                    ),
                    slot_ids=slot_ids,
                    person_ids=[person_id],
                )
            )
    for slot_id, person_id in roster.pins.items():
        if assignment.get(slot_id) != person_id:
            violations.append(
                Violation(
                    code="pin_changed",
                    message=f"Position {slot_id} is locked to {people[person_id].name}.",
                    slot_ids=[slot_id],
                    person_ids=[person_id],
                )
            )
    return violations
