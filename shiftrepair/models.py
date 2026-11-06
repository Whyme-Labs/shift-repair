"""Small, explicit data model for one week of staffing positions.

Dates stay canonical ISO strings across tools, storage and the Desktop page.
Unsupported fields are errors. The baseline describes a published assignment,
so new availability or capacity rules are allowed to make it invalid.
"""

from __future__ import annotations

from datetime import date as calendar_date
from datetime import timedelta
from typing import Annotated, Literal, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StrictStr,
    StringConstraints,
    field_validator,
    model_validator,
)

MAX_PEOPLE = 32
MAX_SLOTS = 126
WINDOW_DAYS = 7


def _clean_text(value: str) -> str:
    if value != value.strip():
        raise ValueError("must not have leading or trailing whitespace")
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError("must not contain control characters")
    if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
        raise ValueError("must not contain unpaired Unicode surrogates")
    return value


def _iso_date(value: str) -> str:
    try:
        parsed = calendar_date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("must be a real calendar date in YYYY-MM-DD format") from exc
    if parsed.isoformat() != value:
        raise ValueError("must be a canonical YYYY-MM-DD date")
    return value


Identifier = Annotated[
    str,
    StringConstraints(strict=True, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$"),
    AfterValidator(_clean_text),
]
Label = Annotated[
    str,
    StringConstraints(strict=True, min_length=1, max_length=120),
    AfterValidator(_clean_text),
]
Role = Annotated[
    str,
    StringConstraints(strict=True, min_length=1, max_length=48),
    AfterValidator(_clean_text),
]
IsoDate = Annotated[
    str,
    StringConstraints(strict=True, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    AfterValidator(_iso_date),
]
NonnegativeFloat = Annotated[float, Field(ge=0, allow_inf_nan=False)]


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        validate_assignment=True,
        revalidate_instances="always",
    )


class Person(StrictModel):
    id: Identifier
    name: Label
    roles: list[Role] = Field(min_length=1, max_length=8)
    available_days: list[IsoDate] = Field(max_length=WINDOW_DAYS)
    max_assignments: int = Field(ge=0, le=WINDOW_DAYS)

    @field_validator("roles", "available_days")
    @classmethod
    def unique_values(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("must not contain duplicates")
        return values


class Slot(StrictModel):
    id: Identifier
    date: IsoDate
    shift: Label
    role: Role


class Roster(StrictModel):
    name: Label
    week_start: IsoDate
    people: list[Person] = Field(min_length=1, max_length=MAX_PEOPLE)
    slots: list[Slot] = Field(min_length=1, max_length=MAX_SLOTS)
    baseline: dict[Identifier, Identifier] = Field(max_length=MAX_SLOTS)
    pins: dict[Identifier, Identifier] = Field(default_factory=dict, max_length=MAX_SLOTS)

    @model_validator(mode="after")
    def validate_references_and_window(self) -> Self:
        person_ids = [person.id for person in self.people]
        slot_ids = [slot.id for slot in self.slots]
        if len(person_ids) != len(set(person_ids)):
            raise ValueError("person IDs must be unique")
        if len(slot_ids) != len(set(slot_ids)):
            raise ValueError("slot IDs must be unique")

        start = calendar_date.fromisoformat(self.week_start)
        try:
            days = {(start + timedelta(days=offset)).isoformat() for offset in range(WINDOW_DAYS)}
        except OverflowError as exc:
            raise ValueError("week_start must allow a complete seven-day window") from exc
        for person in self.people:
            outside = set(person.available_days) - days
            if outside:
                raise ValueError(
                    f"availability for {person.id} is outside the seven-day window: "
                    + ", ".join(sorted(outside))
                )
        for slot in self.slots:
            if slot.date not in days:
                raise ValueError(f"slot {slot.id} is outside the seven-day window")

        known_people = set(person_ids)
        known_slots = set(slot_ids)
        if set(self.baseline) != known_slots:
            raise ValueError("baseline must assign every known slot exactly once")
        if set(self.baseline.values()) - known_people:
            raise ValueError("baseline references an unknown person")
        if set(self.pins) - known_slots:
            raise ValueError("pins reference an unknown slot")
        if set(self.pins.values()) - known_people:
            raise ValueError("pins reference an unknown person")
        return self


class Change(StrictModel):
    slot_id: Identifier
    from_person_id: Identifier
    to_person_id: Identifier


class Violation(StrictModel):
    code: Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
    message: Annotated[str, StringConstraints(min_length=1, max_length=4096)]
    slot_ids: list[StrictStr] = Field(default_factory=list)
    person_ids: list[StrictStr] = Field(default_factory=list)


class Conflict(Violation):
    """A sufficient explanation, with no implicit claim of minimality."""


class SolveResult(StrictModel):
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN", "MODEL_INVALID"]
    assignment: dict[Identifier, Identifier] | None = None
    changes: list[Change] = Field(default_factory=list)
    changed_assignments: int | None = Field(default=None, ge=0)
    optimal: bool = False
    objective_bound: NonnegativeFloat | None = None
    elapsed_seconds: NonnegativeFloat = 0.0
    violations: list[Violation] = Field(default_factory=list)
    conflicts: list[Conflict] = Field(default_factory=list)

    @model_validator(mode="after")
    def keep_status_and_evidence_consistent(self) -> Self:
        feasible = self.status in {"OPTIMAL", "FEASIBLE"}
        if feasible:
            if self.assignment is None or self.changed_assignments is None:
                raise ValueError("a feasible result needs an assignment and change count")
            if self.violations:
                raise ValueError("a feasible result cannot contain validation violations")
            if self.changed_assignments != len(self.changes):
                raise ValueError("change count must match the explicit change list")
            changed_slots: set[str] = set()
            for change in self.changes:
                if change.slot_id in changed_slots:
                    raise ValueError("each changed slot must appear exactly once")
                changed_slots.add(change.slot_id)
                if change.from_person_id == change.to_person_id:
                    raise ValueError("a change must assign a different person")
                if self.assignment.get(change.slot_id) != change.to_person_id:
                    raise ValueError("changes must match the proposed assignment")
            if self.objective_bound is not None and self.objective_bound > self.changed_assignments:
                raise ValueError("objective bound cannot exceed the feasible change count")
            if self.optimal != (self.status == "OPTIMAL"):
                raise ValueError("optimal must match the OPTIMAL status")
            if self.optimal and self.objective_bound != float(self.changed_assignments):
                raise ValueError("an optimal result needs a matching objective bound")
        elif (
            self.assignment is not None
            or self.changes
            or self.changed_assignments is not None
            or self.optimal
            or self.objective_bound is not None
        ):
            raise ValueError("an unresolved result cannot carry an applicable assignment")
        return self
