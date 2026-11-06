"""A fixed, bounded sample checked against a solver-independent exhaustive oracle.

Forty cases cover three/four people, two/three days and four/six positions.
There are 36,760 complete assignment vectors in total. The oracle groups
positions by person and never calls production eligibility or constraint code.
The production checker is compared with it on every vector, not only winners.
"""

from __future__ import annotations

import itertools
import json
import random
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass

from shiftrepair.checker import check
from shiftrepair.models import Person, Roster, Slot
from shiftrepair.solver import solve

SEED = 20261106
DAYS = ("2026-11-09", "2026-11-10", "2026-11-11")
ROLES = ("lead", "floor")


def _slots(rng: random.Random, day_count: int) -> list[Slot]:
    return [
        Slot(id=f"day{index}-{shift}", date=day, shift=shift, role=rng.choice(ROLES))
        for index, day in enumerate(DAYS[:day_count])
        for shift in ("AM", "PM")
    ]


def _random_case(rng: random.Random, person_count: int, index: int) -> Roster:
    people = [
        Person(
            id=f"p{person}",
            name=f"Person {person}",
            roles=list(rng.choice((("lead",), ("floor",), ROLES))),
            available_days=[day for day in DAYS[:2] if rng.random() < 0.8],
            max_assignments=rng.randrange(3),
        )
        for person in range(person_count)
    ]
    slots = _slots(rng, 2)
    ids = [person.id for person in people]
    return Roster(
        name=f"random-{person_count}p-{index:02}",
        week_start=DAYS[0],
        people=people,
        slots=slots,
        baseline={slot.id: rng.choice(ids) for slot in slots},
        pins={slot.id: rng.choice(ids) for slot in slots if rng.random() < 0.3},
    )


def _anchored_case(
    rng: random.Random, person_count: int, day_count: int, index: int
) -> tuple[Roster, dict[str, str]]:
    """Plant one feasible assignment, then generate other allowed facts around it."""
    slots = _slots(rng, day_count)
    ids = [f"p{person}" for person in range(person_count)]
    witness: dict[str, str] = {}
    for day in DAYS[:day_count]:
        day_slots = [slot for slot in slots if slot.date == day]
        for slot, person_id in zip(day_slots, rng.sample(ids, 2), strict=True):
            witness[slot.id] = person_id
    people = []
    for person_id in ids:
        worked = [slot for slot in slots if witness[slot.id] == person_id]
        roles = {slot.role for slot in worked}
        roles.update(role for role in ROLES if rng.random() < 0.5)
        days = {slot.date for slot in worked}
        days.update(day for day in DAYS[:day_count] if rng.random() < 0.5)
        people.append(
            Person(
                id=person_id,
                name=person_id.upper(),
                roles=sorted(roles or {rng.choice(ROLES)}),
                available_days=sorted(days),
                max_assignments=rng.randint(len(worked), day_count),
            )
        )
    roster = Roster(
        name=f"anchored-{person_count}p-{index:02}",
        week_start=DAYS[0],
        people=people,
        slots=slots,
        baseline={
            slot.id: witness[slot.id] if index == 0 or rng.random() < 0.5 else rng.choice(ids)
            for slot in slots
        },
        pins={slot.id: witness[slot.id] for slot in slots if rng.random() < 0.3},
    )
    return roster, witness


def _generated_cases() -> list[Roster]:
    rng = random.Random(SEED)
    cases = [_random_case(rng, 3, index) for index in range(16)]
    cases.extend(_random_case(rng, 4, index) for index in range(8))
    cases.extend(_anchored_case(rng, 4, 3, index)[0] for index in range(8))
    for index in range(8):
        roster, witness = _anchored_case(rng, 3, 2, index)
        data = roster.model_dump()
        first, second = roster.slots[:2]
        person_id = witness[first.id]
        person = next(person for person in data["people"] if person["id"] == person_id)
        data["pins"][first.id] = person_id
        kind = ("availability", "qualification", "daily_capacity", "weekly_capacity")[index % 4]
        if kind == "availability":
            person["available_days"].remove(first.date)
        elif kind == "qualification":
            person["roles"] = [role for role in ROLES if role != first.role]
        elif kind == "daily_capacity":
            person["roles"] = list(ROLES)
            data["pins"][second.id] = person_id
        else:
            person["max_assignments"] = 0
        data["name"] = f"disrupted-{kind}-{index:02}"
        cases.append(Roster.model_validate(data))
    return cases


def _oracle_accepts(roster: Roster, assignment: dict[str, str]) -> bool:
    """Declarative checks by person, independent of checker/CP-SAT implementation."""
    if any(assignment[slot_id] != person_id for slot_id, person_id in roster.pins.items()):
        return False
    for person in roster.people:
        positions = [slot for slot in roster.slots if assignment[slot.id] == person.id]
        dates = {slot.date for slot in positions}
        if len(positions) > person.max_assignments or len(dates) != len(positions):
            return False
        if not dates.issubset(person.available_days):
            return False
        if not {slot.role for slot in positions}.issubset(person.roles):
            return False
    return True


@dataclass
class OracleResult:
    examined: int
    feasible: int
    minimum: int | None
    best: set[tuple[str, ...]]
    rejected_rules: set[str]


def _enumerate_and_compare_checker(roster: Roster) -> OracleResult:
    slot_ids = [slot.id for slot in roster.slots]
    person_ids = [person.id for person in roster.people]
    result = OracleResult(0, 0, None, set(), set())
    for choices in itertools.product(person_ids, repeat=len(slot_ids)):
        result.examined += 1
        assignment = dict(zip(slot_ids, choices, strict=True))
        valid = _oracle_accepts(roster, assignment)
        violations = check(roster, assignment)
        assert (not violations) == valid, (roster.name, assignment, violations)
        result.rejected_rules.update(violation.code for violation in violations)
        if not valid:
            continue
        result.feasible += 1
        cost = sum(assignment[slot_id] != old for slot_id, old in roster.baseline.items())
        if result.minimum is None or cost < result.minimum:
            result.minimum, result.best = cost, {choices}
        elif cost == result.minimum:
            result.best.add(choices)
    return result


def test_generated_rosters_match_independent_exhaustive_oracle(
    record_property: Callable[[str, object], None],
) -> None:
    cases = _generated_cases()
    summary: Counter[str] = Counter(cases=len(cases))
    objectives: Counter[int] = Counter()
    rejected_rules: set[str] = set()
    for roster in cases:
        original = roster.model_dump()
        oracle = _enumerate_and_compare_checker(roster)
        result = solve(roster)
        assert roster.model_dump() == original, roster.name
        summary["assignments_examined"] += oracle.examined
        summary["feasible_assignments"] += oracle.feasible
        rejected_rules.update(oracle.rejected_rules)
        if oracle.minimum is None:
            summary["infeasible_cases"] += 1
            assert result.status == "INFEASIBLE", (roster.name, result)
            assert result.assignment is None and not result.optimal, roster.name
            assert result.conflicts, roster.name
        else:
            summary["feasible_cases"] += 1
            objectives[oracle.minimum] += 1
            assert result.status == "OPTIMAL", (roster.name, result)
            assert result.changed_assignments == result.objective_bound == oracle.minimum, (
                roster.name
            )
            assert result.assignment is not None, roster.name
            chosen = tuple(result.assignment[slot.id] for slot in roster.slots)
            assert chosen in oracle.best, (roster.name, result)
            assert {
                (change.slot_id, change.from_person_id, change.to_person_id)
                for change in result.changes
            } == {
                (slot_id, old, result.assignment[slot_id])
                for slot_id, old in roster.baseline.items()
                if old != result.assignment[slot_id]
            }, roster.name
    assert summary["cases"] == 40
    assert summary["assignments_examined"] == 36_760
    assert summary["feasible_cases"] >= 8 and summary["infeasible_cases"] >= 8
    assert {
        "unavailable",
        "unqualified",
        "daily_capacity",
        "weekly_capacity",
        "pin_changed",
    } <= rejected_rules
    for name, count in summary.items():
        record_property(name, count)
    record_property("seed", SEED)
    print(
        "oracle_evidence="
        + json.dumps({"seed": SEED, **summary, "minimum_change_counts": objectives}, sort_keys=True)
    )
