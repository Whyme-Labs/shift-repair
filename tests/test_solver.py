"""Correctness at the public solver/checker boundary, including an exact oracle."""

from __future__ import annotations

import itertools
import math

import pytest

from shiftrepair.checker import check
from shiftrepair.examples import demo_roster
from shiftrepair.models import Person, Roster
from shiftrepair.solver import solve


def absent(roster: Roster, person_id: str, day: str) -> Roster:
    data = roster.model_dump()
    for person in data["people"]:
        if person["id"] == person_id:
            person["available_days"].remove(day)
    return Roster.model_validate(data)


def tiny_roster() -> Roster:
    days = ["2026-11-09", "2026-11-10", "2026-11-11"]
    return Roster.model_validate(
        {
            "name": "Exact six-position oracle",
            "week_start": days[0],
            "people": [
                {
                    "id": "asha",
                    "name": "Asha",
                    "roles": ["lead"],
                    "available_days": days[1:],
                    "max_assignments": 2,
                },
                {
                    "id": "ben",
                    "name": "Ben",
                    "roles": ["lead"],
                    "available_days": [days[0], days[2]],
                    "max_assignments": 1,
                },
                {
                    "id": "eli",
                    "name": "Eli",
                    "roles": ["floor"],
                    "available_days": days,
                    "max_assignments": 3,
                },
            ],
            "slots": [
                {"id": f"{day}:AM:{role}", "date": day, "shift": "AM", "role": role}
                for day in days
                for role in ("lead", "floor")
            ],
            "baseline": {
                **{f"{day}:AM:lead": "ben" if day == days[2] else "asha" for day in days},
                **{f"{day}:AM:floor": "eli" for day in days},
            },
            "pins": {f"{days[1]}:AM:floor": "eli"},
        }
    )


def test_demo_is_valid_and_needs_no_changes() -> None:
    roster = demo_roster()
    assert len(roster.people) == 8
    assert len(roster.slots) == 28
    assert check(roster, roster.baseline) == []
    result = solve(roster)
    assert result.status == "OPTIMAL"
    assert result.optimal is True
    assert result.changed_assignments == result.objective_bound == 0
    assert result.assignment == roster.baseline
    assert result.violations == result.conflicts == []


def test_absence_requires_a_two_slot_cascade_without_mutating_input() -> None:
    roster = absent(demo_roster(), "asha", "2026-11-09")
    original = roster.model_dump()
    assert any(v.code == "unavailable" for v in check(roster, roster.baseline))
    result = solve(roster)
    assert result.status == "OPTIMAL"
    assert result.changed_assignments == result.objective_bound == 2
    assert result.assignment is not None
    assert check(roster, result.assignment) == []
    assert result.assignment["2026-11-09:AM:lead"] == "chen"
    assert roster.model_dump() == original
    assert len(result.changes) == 2


def test_tiny_optimum_agrees_with_all_729_possible_assignments() -> None:
    roster = tiny_roster()
    slot_ids = [slot.id for slot in roster.slots]
    person_ids = [person.id for person in roster.people]
    costs = []
    examined = 0
    for choices in itertools.product(person_ids, repeat=len(slot_ids)):
        examined += 1
        assignment = dict(zip(slot_ids, choices, strict=True))
        if not check(roster, assignment):
            costs.append(sum(assignment[sid] != pid for sid, pid in roster.baseline.items()))
    assert examined == 729
    assert costs
    result = solve(roster)
    assert result.status == "OPTIMAL"
    assert result.changed_assignments == result.objective_bound == min(costs) == 2
    assert result.assignment is not None
    assert check(roster, result.assignment) == []


def test_infeasible_shortage_names_actual_facts_and_relief_is_explicit() -> None:
    roster = absent(absent(demo_roster(), "asha", "2026-11-09"), "chen", "2026-11-09")
    original = roster.model_dump()
    result = solve(roster)
    assert result.status == "INFEASIBLE"
    assert result.assignment is None
    assert result.changed_assignments is None
    assert result.optimal is False
    shortage = next(c for c in result.conflicts if c.code == "daily_role_shortfall")
    assert "2026-11-09" in shortage.message
    assert "2" in shortage.message and "1" in shortage.message and "Ben" in shortage.message
    assert shortage.person_ids == ["ben"]
    assert len(shortage.slot_ids) == 2
    assert roster.model_dump() == original

    relief = Person(
        id="relief",
        name="Relief",
        roles=["lead"],
        available_days=["2026-11-09"],
        max_assignments=1,
    )
    repaired = Roster.model_validate(
        {**original, "people": [*original["people"], relief.model_dump()]}
    )
    repaired_result = solve(repaired)
    assert repaired_result.status == "OPTIMAL"
    assert repaired_result.changed_assignments == repaired_result.objective_bound == 1
    assert repaired_result.assignment is not None
    assert repaired_result.assignment["2026-11-09:AM:lead"] == "relief"
    assert check(repaired, repaired_result.assignment) == []
    assert repaired.model_dump()["people"][:-1] == original["people"]
    assert repaired.slots == roster.slots and repaired.pins == roster.pins


def test_unavailable_pinned_worker_is_not_silently_replaced() -> None:
    roster = absent(demo_roster(), "eli", "2026-11-09")
    result = solve(roster)
    assert result.status == "INFEASIBLE"
    assert result.assignment is None
    conflict = next(c for c in result.conflicts if c.code == "pinned_person_unavailable")
    assert conflict.person_ids == ["eli"]
    assert conflict.slot_ids == ["2026-11-09:AM:floor"]


def test_checker_rejects_corrupted_solver_outputs() -> None:
    roster = demo_roster()
    probes = [
        ({**roster.baseline, "2026-11-09:AM:lead": "gopal"}, "unqualified"),
        ({**roster.baseline, "2026-11-09:AM:lead": "devi"}, "unavailable"),
        ({**roster.baseline, "2026-11-09:PM:lead": "asha"}, "daily_capacity"),
        ({**roster.baseline, "2026-11-10:AM:lead": "asha"}, "weekly_capacity"),
        ({**roster.baseline, "2026-11-09:AM:floor": "hana"}, "pin_changed"),
        (
            {sid: pid for sid, pid in roster.baseline.items() if sid != "2026-11-09:AM:lead"},
            "missing_slot",
        ),
        ({**roster.baseline, "invented": "asha"}, "unknown_slot"),
        ({**roster.baseline, "2026-11-09:AM:lead": "ghost"}, "unknown_person"),
    ]
    for assignment, expected_code in probes:
        assert expected_code in {violation.code for violation in check(roster, assignment)}


def test_checker_rejects_malformed_assignment_data_without_crashing() -> None:
    roster = demo_roster()
    assert check(roster, None)[0].code == "invalid_assignment"  # type: ignore[arg-type]
    assert check(roster, {"2026-11-09:AM:lead": 7})  # type: ignore[dict-item]
    assert check(roster, {1: "asha"})  # type: ignore[dict-item]


def test_zero_time_budget_is_unknown_without_applicable_output() -> None:
    result = solve(demo_roster(), time_limit_seconds=0)
    assert result.status == "UNKNOWN"
    assert result.assignment is None and result.changed_assignments is None
    assert result.optimal is False
    assert result.conflicts == []


@pytest.mark.parametrize("limit", [-1, math.inf, math.nan, True, "5", 31])
def test_invalid_time_budgets_are_rejected(limit: object) -> None:
    with pytest.raises(ValueError, match="time_limit_seconds"):
        solve(demo_roster(), time_limit_seconds=limit)  # type: ignore[arg-type]


def test_weekly_capacity_conflict_is_not_masked_as_an_availability_shortage() -> None:
    data = demo_roster().model_dump()
    for person in data["people"]:
        person["max_assignments"] = 1
    result = solve(Roster.model_validate(data))
    assert result.status == "INFEASIBLE"
    assert any(conflict.code == "weekly_capacity_shortfall" for conflict in result.conflicts)


def test_multi_role_daily_competition_is_infeasible_without_lying_about_skills() -> None:
    data = tiny_roster().model_dump()
    data["people"] = [
        {
            "id": "asha",
            "name": "Asha",
            "roles": ["lead", "floor"],
            "available_days": ["2026-11-09"],
            "max_assignments": 1,
        }
    ]
    data["slots"] = data["slots"][:2]
    data["baseline"] = {slot["id"]: "asha" for slot in data["slots"]}
    data["pins"] = {}
    result = solve(Roster.model_validate(data))
    assert result.status == "INFEASIBLE"
    assert any(conflict.code == "daily_capacity_shortfall" for conflict in result.conflicts)


def test_combined_role_conflict_uses_a_separate_feasibility_proof() -> None:
    # Every role has a candidate, and there are three staff for three positions.
    # Asha is nevertheless the only candidate for both lead and floor.
    # Per-role and total-headcount arithmetic alone cannot prove this conflict.
    day = "2026-11-09"
    roster = Roster.model_validate(
        {
            "name": "Competing role requirements",
            "week_start": day,
            "people": [
                {
                    "id": "asha",
                    "name": "Asha",
                    "roles": ["lead", "floor"],
                    "available_days": [day],
                    "max_assignments": 2,
                },
                {
                    "id": "ben",
                    "name": "Ben",
                    "roles": ["desk"],
                    "available_days": [day],
                    "max_assignments": 1,
                },
                {
                    "id": "chen",
                    "name": "Chen",
                    "roles": ["desk"],
                    "available_days": [day],
                    "max_assignments": 1,
                },
            ],
            "slots": [
                {"id": role, "date": day, "shift": "AM", "role": role}
                for role in ("lead", "floor", "desk")
            ],
            "baseline": {"lead": "asha", "floor": "asha", "desk": "ben"},
            "pins": {},
        }
    )
    result = solve(roster)
    assert result.status == "INFEASIBLE"
    codes = {conflict.code for conflict in result.conflicts}
    assert "sufficient_conflict_set" in codes
    assert "coverage_rule" in codes
    assert "daily_limit" in codes
    assert (
        not {"daily_role_shortfall", "daily_capacity_shortfall", "weekly_capacity_shortfall"}
        & codes
    )
    assert any("Asha" in conflict.message for conflict in result.conflicts)


def test_in_place_mutation_cannot_bypass_solver_input_validation() -> None:
    from pydantic import ValidationError

    roster = demo_roster()
    roster.people.append(roster.people[0])
    with pytest.raises(ValidationError, match="person IDs must be unique"):
        solve(roster)
