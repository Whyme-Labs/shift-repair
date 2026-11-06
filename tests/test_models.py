"""Validate the input boundary before any solver or persistence code runs."""

import copy
import unittest

from pydantic import ValidationError

from shiftrepair.models import Person, Roster, SolveResult


def minimal_payload():
    return {
        "name": "A small rota",
        "week_start": "2026-11-09",
        "people": [
            {
                "id": "asha",
                "name": "Asha",
                "roles": ["lead"],
                "available_days": ["2026-11-09"],
                "max_assignments": 1,
            }
        ],
        "slots": [
            {
                "id": "mon-am-lead",
                "date": "2026-11-09",
                "shift": "AM",
                "role": "lead",
            }
        ],
        "baseline": {"mon-am-lead": "asha"},
        "pins": {},
    }


class InputBoundaryTests(unittest.TestCase):
    def test_json_round_trip_keeps_explicit_date_strings(self):
        roster = Roster.model_validate(minimal_payload())
        self.assertEqual(roster.week_start, "2026-11-09")
        self.assertEqual(roster.people[0].available_days, ["2026-11-09"])
        self.assertEqual(Roster.model_validate_json(roster.model_dump_json()), roster)

    def test_unknown_rules_are_rejected_instead_of_ignored(self):
        payload = minimal_payload()
        payload["minimum_rest_hours"] = 11
        with self.assertRaises(ValidationError):
            Roster.model_validate(payload)

    def test_availability_is_required_but_can_explicitly_be_empty(self):
        payload = minimal_payload()
        del payload["people"][0]["available_days"]
        with self.assertRaises(ValidationError):
            Roster.model_validate(payload)
        payload["people"][0]["available_days"] = []
        roster = Roster.model_validate(payload)
        self.assertEqual(roster.people[0].available_days, [])
        self.assertEqual(roster.baseline["mon-am-lead"], "asha")

    def test_capacity_does_not_coerce_text_booleans_or_fractions(self):
        for invalid in [True, False, "1", 1.5, -1, 8]:
            with self.subTest(invalid=invalid):
                person = minimal_payload()["people"][0]
                person["max_assignments"] = invalid
                with self.assertRaises(ValidationError):
                    Person.model_validate(person)

    def test_invalid_and_noncanonical_dates_are_rejected(self):
        for invalid in ["2026-02-30", "2026-1-9", "2026-11-09T00:00:00", 1794182400]:
            with self.subTest(invalid=invalid):
                payload = minimal_payload()
                payload["week_start"] = invalid
                with self.assertRaises(ValidationError):
                    Roster.model_validate(payload)

    def test_duplicate_ids_roles_and_availability_are_rejected(self):
        mutations = [
            lambda p: p["people"].append(copy.deepcopy(p["people"][0])),
            lambda p: p["slots"].append(copy.deepcopy(p["slots"][0])),
            lambda p: p["people"][0]["roles"].append("lead"),
            lambda p: p["people"][0]["available_days"].append("2026-11-09"),
        ]
        for mutate in mutations:
            payload = minimal_payload()
            mutate(payload)
            with self.assertRaises(ValidationError):
                Roster.model_validate(payload)

    def test_dates_must_belong_to_the_seven_day_window(self):
        for outside in ["2026-11-08", "2026-11-16"]:
            with self.subTest(outside=outside):
                payload = minimal_payload()
                payload["people"][0]["available_days"] = [outside]
                with self.assertRaises(ValidationError):
                    Roster.model_validate(payload)
                payload = minimal_payload()
                payload["slots"][0]["date"] = outside
                with self.assertRaises(ValidationError):
                    Roster.model_validate(payload)

    def test_assignment_references_must_be_complete_and_known(self):
        for baseline in [{}, {"mon-am-lead": "unknown"}, {"other": "asha"}]:
            with self.subTest(baseline=baseline):
                payload = minimal_payload()
                payload["baseline"] = baseline
                with self.assertRaises(ValidationError):
                    Roster.model_validate(payload)
        for pins in [{"other": "asha"}, {"mon-am-lead": "unknown"}]:
            with self.subTest(pins=pins):
                payload = minimal_payload()
                payload["pins"] = pins
                with self.assertRaises(ValidationError):
                    Roster.model_validate(payload)

    def test_staff_limit_is_enforced_at_input(self):
        payload = minimal_payload()
        for i in range(32):
            person = copy.deepcopy(payload["people"][0])
            person["id"] = f"reserve-{i}"
            payload["people"].append(person)
        with self.assertRaises(ValidationError):
            Roster.model_validate(payload)

    def test_result_cannot_claim_optimality_without_matching_bound(self):
        with self.assertRaises(ValidationError):
            SolveResult(
                status="OPTIMAL",
                assignment={"slot": "asha"},
                changed_assignments=0,
                optimal=True,
                objective_bound=1.0,
            )

    def test_unresolved_result_cannot_carry_an_applicable_assignment(self):
        for status in ["UNKNOWN", "INFEASIBLE", "MODEL_INVALID"]:
            with self.subTest(status=status), self.assertRaises(ValidationError):
                SolveResult.model_validate({"status": status, "assignment": {"slot": "asha"}})

    def test_result_rejects_a_bound_above_its_feasible_objective(self):
        with self.assertRaises(ValidationError):
            SolveResult(
                status="FEASIBLE",
                assignment={"slot": "asha"},
                changed_assignments=0,
                objective_bound=1.0,
            )

    def test_result_change_list_must_describe_its_actual_assignment(self):
        with self.assertRaises(ValidationError):
            SolveResult.model_validate(
                {
                    "status": "FEASIBLE",
                    "assignment": {"slot": "asha"},
                    "changed_assignments": 1,
                    "changes": [
                        {"slot_id": "slot", "from_person_id": "asha", "to_person_id": "ben"}
                    ],
                }
            )


if __name__ == "__main__":
    unittest.main()
