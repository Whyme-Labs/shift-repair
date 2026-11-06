"""Deterministic, fictional staffing data for the interactive demo."""

from __future__ import annotations

from datetime import date, timedelta

from .models import Person, Roster, Slot


def demo_roster() -> Roster:
    """Eight staff and 28 positions with a valid, published starting assignment.

    Asha's Monday absence needs a two-position repair. Asha and Chen both absent
    on Monday make the lead coverage impossible. An explicitly added qualified
    relief worker resolves that shortage without changing existing facts.
    """
    start = date(2026, 11, 9)
    days = [(start + timedelta(days=offset)).isoformat() for offset in range(7)]
    names = ["Asha", "Ben", "Chen", "Devi", "Eli", "Farah", "Gopal", "Hana"]
    people = [
        Person(
            id=name.lower(),
            name=name,
            roles=["lead" if index < 4 else "floor"],
            available_days=days[1:] if name == "Devi" else days.copy(),
            max_assignments=3 if name == "Chen" else 4,
        )
        for index, name in enumerate(names)
    ]
    slots = [
        Slot(id=f"{day}:{shift}:{role}", date=day, shift=shift, role=role)
        for day in days
        for shift in ("AM", "PM")
        for role in ("lead", "floor")
    ]
    baseline: dict[str, str] = {}
    for offset, day in enumerate(days):
        leads = ("asha", "ben") if offset % 2 == 0 else ("chen", "devi")
        floors = ("eli", "farah") if offset % 2 == 0 else ("gopal", "hana")
        for index, shift in enumerate(("AM", "PM")):
            baseline[f"{day}:{shift}:lead"] = leads[index]
            baseline[f"{day}:{shift}:floor"] = floors[index]
    return Roster(
        name="Cedar team · demo week",
        week_start=days[0],
        people=people,
        slots=slots,
        baseline=baseline,
        pins={
            f"{days[3]}:AM:lead": "chen",
            f"{days[6]}:PM:lead": "ben",
            f"{days[0]}:AM:floor": "eli",
        },
    )
