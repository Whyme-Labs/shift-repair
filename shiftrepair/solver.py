"""Bounded integer optimization with separate assignment and conflict checks.

The objective counts positions whose assigned person changes from the published
baseline. Every accepted availability, qualification, capacity and pin remains
hard. No penalty can buy a violation, and no result changes the input roster.
"""

from __future__ import annotations

import math
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from .checker import check
from .models import Change, Conflict, Person, Roster, Slot, SolveResult, Violation

if TYPE_CHECKING:
    from ortools.sat.python.cp_model import CpModel, CpSolver, IntVar

MAX_TIME_LIMIT_SECONDS = 30.0
RANDOM_SEED = 20261105


@dataclass
class _BuiltModel:
    model: CpModel
    assignments: dict[tuple[str, str], IntVar]
    labels: dict[int, Conflict]


def _eligible(person: Person, slot: Slot) -> bool:
    return slot.role in person.roles and slot.date in person.available_days


def _build(roster: Roster, *, diagnostic: bool) -> _BuiltModel:
    from ortools.sat.python import cp_model

    model = cp_model.CpModel()
    variables = {
        (slot.id, person.id): model.new_bool_var(f"{slot.id}/{person.id}")
        for slot in roster.slots
        for person in roster.people
    }
    labels: dict[int, Conflict] = {}
    by_day: dict[str, list[Slot]] = defaultdict(list)
    for slot in roster.slots:
        by_day[slot.date].append(slot)

    def rule(expression: Any, label: Conflict) -> None:
        constraint = model.add(expression)
        if diagnostic:
            literal = model.new_bool_var(f"rule/{len(labels)}")
            constraint.only_enforce_if(literal)
            model.add_assumption(literal)
            labels[literal.index] = label

    for slot in roster.slots:
        for person in roster.people:
            if not _eligible(person, slot):
                model.add(variables[slot.id, person.id] == 0)
        eligible_ids = [person.id for person in roster.people if _eligible(person, slot)]
        rule(
            sum(variables[slot.id, person.id] for person in roster.people) == 1,
            Conflict(
                code="coverage_rule",
                message=(
                    f"{slot.date} {slot.shift} needs exactly 1 {slot.role}. "
                    f"{len(eligible_ids)} people have the required role and declared availability."
                ),
                slot_ids=[slot.id],
                person_ids=eligible_ids,
            ),
        )

    for person in roster.people:
        rule(
            sum(variables[slot.id, person.id] for slot in roster.slots) <= person.max_assignments,
            Conflict(
                code="weekly_limit",
                message=f"{person.name}'s accepted weekly maximum is {person.max_assignments} assignments.",
                slot_ids=[slot.id for slot in roster.slots if _eligible(person, slot)],
                person_ids=[person.id],
            ),
        )
        for day, slots in by_day.items():
            rule(
                sum(variables[slot.id, person.id] for slot in slots) <= 1,
                Conflict(
                    code="daily_limit",
                    message=f"{person.name} can cover at most 1 position on {day}.",
                    slot_ids=[slot.id for slot in slots],
                    person_ids=[person.id],
                ),
            )
    people_by_id = {person.id: person for person in roster.people}
    for slot_id, person_id in roster.pins.items():
        rule(
            variables[slot_id, person_id] == 1,
            Conflict(
                code="locked_assignment",
                message=f"Position {slot_id} is locked to {people_by_id[person_id].name}.",
                slot_ids=[slot_id],
                person_ids=[person_id],
            ),
        )

    if not diagnostic:
        model.minimize(sum(1 - variables[sid, pid] for sid, pid in roster.baseline.items()))
    return _BuiltModel(model, variables, labels)


def _engine(seconds: float) -> CpSolver:
    from ortools.sat.python import cp_model

    engine = cp_model.CpSolver()
    engine.parameters.num_search_workers = 1
    engine.parameters.random_seed = RANDOM_SEED
    engine.parameters.max_time_in_seconds = max(0.0, seconds)
    # OPTIMAL must mean exact proof, not termination at a nonzero configured gap.
    engine.parameters.absolute_gap_limit = 0.0
    engine.parameters.relative_gap_limit = 0.0
    return engine


def _direct_conflicts(roster: Roster) -> list[Conflict]:
    """Find short arithmetic certificates without guessing at missing facts."""
    conflicts: list[Conflict] = []
    people = {person.id: person for person in roster.people}
    slots = {slot.id: slot for slot in roster.slots}
    pinned_per_day: dict[tuple[str, str], list[str]] = defaultdict(list)
    pinned_per_person: dict[str, list[str]] = defaultdict(list)
    for slot_id, person_id in roster.pins.items():
        slot, person = slots[slot_id], people[person_id]
        pinned_per_day[person_id, slot.date].append(slot_id)
        pinned_per_person[person_id].append(slot_id)
        if slot.date not in person.available_days:
            conflicts.append(
                Conflict(
                    code="pinned_person_unavailable",
                    message=(
                        f"{slot_id} is locked to {person.name}, who is unavailable on {slot.date}. "
                        "The lock and availability cannot both be satisfied."
                    ),
                    slot_ids=[slot_id],
                    person_ids=[person_id],
                )
            )
        if slot.role not in person.roles:
            conflicts.append(
                Conflict(
                    code="pinned_person_unqualified",
                    message=(
                        f"{slot_id} requires {slot.role} but is locked to {person.name}, "
                        "who does not have that role."
                    ),
                    slot_ids=[slot_id],
                    person_ids=[person_id],
                )
            )
    for (person_id, day), slot_ids in pinned_per_day.items():
        if len(slot_ids) > 1:
            conflicts.append(
                Conflict(
                    code="pinned_daily_capacity",
                    message=(
                        f"{people[person_id].name} is locked into {len(slot_ids)} positions on {day}; "
                        "the daily maximum is 1."
                    ),
                    slot_ids=slot_ids,
                    person_ids=[person_id],
                )
            )
    for person_id, slot_ids in pinned_per_person.items():
        person = people[person_id]
        if len(slot_ids) > person.max_assignments:
            conflicts.append(
                Conflict(
                    code="pinned_weekly_capacity",
                    message=(
                        f"{person.name} has {len(slot_ids)} locked positions but a weekly maximum "
                        f"of {person.max_assignments}."
                    ),
                    slot_ids=slot_ids,
                    person_ids=[person_id],
                )
            )

    by_day_role: dict[tuple[str, str], list[Slot]] = defaultdict(list)
    by_day: dict[str, list[Slot]] = defaultdict(list)
    for slot in roster.slots:
        by_day_role[slot.date, slot.role].append(slot)
        by_day[slot.date].append(slot)
    for (day, role), role_slots in by_day_role.items():
        eligible = [
            person
            for person in roster.people
            if day in person.available_days and role in person.roles and person.max_assignments > 0
        ]
        if len(eligible) < len(role_slots):
            names = ", ".join(person.name for person in eligible[:8]) or "none"
            if len(eligible) > 8:
                names += f", and {len(eligible) - 8} other people"
            conflicts.append(
                Conflict(
                    code="daily_role_shortfall",
                    message=(
                        f"{day} needs {len(role_slots)} {role} assignments. "
                        f"Only {len(eligible)} qualified, available people have positive weekly capacity: "
                        f"{names}. With at most 1 assignment per person per day, "
                        f"at least {len(role_slots) - len(eligible)} position(s) cannot be covered."
                    ),
                    slot_ids=[slot.id for slot in role_slots],
                    person_ids=[person.id for person in eligible],
                )
            )
    for day, day_slots in by_day.items():
        eligible = [
            person
            for person in roster.people
            if person.max_assignments > 0 and any(_eligible(person, slot) for slot in day_slots)
        ]
        if len(eligible) < len(day_slots):
            conflicts.append(
                Conflict(
                    code="daily_capacity_shortfall",
                    message=(
                        f"{day} requires {len(day_slots)} assignments, but only {len(eligible)} people "
                        "are available, qualified for any required role, and have positive weekly capacity. "
                        "Each person can work at most 1 position that day."
                    ),
                    slot_ids=[slot.id for slot in day_slots],
                    person_ids=[person.id for person in eligible],
                )
            )
    upper_capacity = sum(
        min(
            person.max_assignments,
            len({slot.date for slot in roster.slots if _eligible(person, slot)}),
        )
        for person in roster.people
    )
    if upper_capacity < len(roster.slots):
        conflicts.append(
            Conflict(
                code="weekly_capacity_shortfall",
                message=(
                    f"The week needs {len(roster.slots)} assignments. Declared weekly maxima and "
                    f"available qualified days allow at most {upper_capacity} assignments in total."
                ),
                slot_ids=[slot.id for slot in roster.slots],
                person_ids=[person.id for person in roster.people],
            )
        )
    return conflicts


def _diagnose(roster: Roster, deadline: float) -> list[Conflict]:
    """Run a separate feasibility model; never call its sufficient core smallest."""
    from ortools.sat.python import cp_model

    direct = _direct_conflicts(roster)
    if time.perf_counter() >= deadline:
        return direct or [
            Conflict(
                code="incompatible_rules",
                message=(
                    "No assignment satisfies the accepted rules. The optimization run proved "
                    "infeasibility, but no time remained for a separate conflict diagnosis."
                ),
            )
        ]
    built = _build(roster, diagnostic=True)
    engine = _engine(deadline - time.perf_counter())
    status = engine.solve(built.model)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError("Optimization and independent feasibility models disagree.")
    if direct:
        return direct
    if status == cp_model.INFEASIBLE:
        core = engine.sufficient_assumptions_for_infeasibility()
        labels = [built.labels[index] for index in core]
        return [
            Conflict(
                code="sufficient_conflict_set",
                message=(
                    "The following rules are incompatible together with declared availability and "
                    "qualifications. A separate feasibility solve proved this sufficient set; "
                    "it is not claimed to be the smallest conflict."
                ),
            ),
            *labels,
        ]
    if status == cp_model.MODEL_INVALID:
        return [
            Conflict(
                code="diagnosis_unavailable",
                message=(
                    "The optimization run proved infeasibility, but the separate diagnostic "
                    "model was rejected. No conflict set is available."
                ),
            )
        ]
    return [
        Conflict(
            code="incompatible_rules",
            message=(
                "No assignment satisfies the accepted rules. The optimization run proved "
                "infeasibility; the separate diagnosis did not prove a conflict within its budget."
            ),
        )
    ]


def solve(roster: Roster, time_limit_seconds: float = 5.0) -> SolveResult:
    """Find the fewest changed positions within a bounded, single-worker search.

    The budget covers model construction, optimization and diagnosis after lazy
    engine import. Input validation and engine startup can add overhead. UNKNOWN
    means no feasible assignment was found within the budget, not infeasibility.
    """
    if (
        isinstance(time_limit_seconds, bool)
        or not isinstance(time_limit_seconds, (int, float))
        or not math.isfinite(time_limit_seconds)
        or not 0 <= time_limit_seconds <= MAX_TIME_LIMIT_SECONDS
    ):
        raise ValueError(
            f"time_limit_seconds must be a finite number between 0 and {MAX_TIME_LIMIT_SECONDS:g}"
        )
    if not isinstance(roster, Roster):
        raise TypeError("roster must be a validated Roster")
    # Pydantic assignment validation cannot guard in-place mutation of nested lists.
    roster = Roster.model_validate(roster.model_dump())
    from ortools.sat.python import cp_model

    started = time.perf_counter()
    deadline = started + float(time_limit_seconds)

    def result(status: Any, **fields: Any) -> SolveResult:
        return SolveResult(status=status, elapsed_seconds=time.perf_counter() - started, **fields)

    if time_limit_seconds == 0:
        return result("UNKNOWN")
    built = _build(roster, diagnostic=False)
    invalid = built.model.validate()
    if invalid:
        return result(
            "MODEL_INVALID",
            violations=[Violation(code="invalid_model", message=invalid[:4096])],
        )
    if time.perf_counter() >= deadline:
        return result("UNKNOWN")
    engine = _engine(deadline - time.perf_counter())
    status = engine.solve(built.model)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        assignment = {
            slot.id: next(
                person.id
                for person in roster.people
                if engine.value(built.assignments[slot.id, person.id])
            )
            for slot in roster.slots
        }
        violations = check(roster, assignment)
        if violations:
            return result("MODEL_INVALID", violations=violations)
        changes = [
            Change(slot_id=sid, from_person_id=old, to_person_id=assignment[sid])
            for sid, old in roster.baseline.items()
            if assignment[sid] != old
        ]
        objective = engine.objective_value
        bound = engine.best_objective_bound
        if objective != len(changes) or not math.isfinite(bound) or bound > objective:
            return result(
                "MODEL_INVALID",
                violations=[
                    Violation(
                        code="objective_mismatch",
                        message="The solver objective or bound does not match the checked assignment.",
                    )
                ],
            )
        optimal = status == cp_model.OPTIMAL and bound == objective
        return result(
            "OPTIMAL" if optimal else "FEASIBLE",
            assignment=assignment,
            changes=changes,
            changed_assignments=len(changes),
            optimal=optimal,
            objective_bound=max(0.0, float(bound)),
        )
    if status == cp_model.INFEASIBLE:
        return result("INFEASIBLE", conflicts=_diagnose(roster, deadline))
    if status == cp_model.MODEL_INVALID:
        return result(
            "MODEL_INVALID",
            violations=[
                Violation(code="invalid_model", message="The solver rejected the generated model.")
            ],
        )
    return result("UNKNOWN")
