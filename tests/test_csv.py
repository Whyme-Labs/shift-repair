from __future__ import annotations

import csv
import io

import pytest

from shiftrepair.csv_io import export_project, export_schedule, import_project
from shiftrepair.errors import ServiceError
from shiftrepair.examples import demo_roster
from shiftrepair.models import Roster


def test_full_project_round_trip_preserves_all_rules_and_unicode() -> None:
    roster = demo_roster()
    assert import_project(export_project(roster)) == roster
    assert import_project("\ufeff" + export_project(roster)) == roster


@pytest.mark.parametrize("name", ["=SUM(1,2)", "+formula", "-formula", "@formula", "'quoted"])
def test_formula_cells_are_escaped_without_losing_original_text(name: str) -> None:
    data = demo_roster().model_dump()
    data["people"][0]["name"] = name
    roster = Roster.model_validate(data)
    project = export_project(roster)
    assert import_project(project) == roster
    rows = list(csv.DictReader(io.StringIO(export_schedule(roster))))
    cells = [row["name"] for row in rows if row["person_id"] == "asha"]
    assert cells and all(cell == "'" + name for cell in cells)


def test_schedule_csv_cannot_silently_import_without_constraints() -> None:
    with pytest.raises(ServiceError, match="full project CSV"):
        import_project(export_schedule(demo_roster()))


def test_duplicate_rows_extra_columns_and_invalid_json_are_errors() -> None:
    content = export_project(demo_roster())
    rows = content.splitlines()
    with pytest.raises(ServiceError):
        import_project(content + rows[2] + "\n")
    with pytest.raises(ServiceError):
        import_project(content.replace("record_type,", "unknown,", 1))
    with pytest.raises(ServiceError):
        import_project(content.replace('[""lead""]', "not-json", 1))
    with pytest.raises(ServiceError):
        import_project(content + rows[1] + "\n")
    with pytest.raises(ServiceError):
        import_project(content.replace("roster,,", "roster,forbidden-id,", 1))


def test_oversized_and_malformed_csv_are_rejected() -> None:
    with pytest.raises(ServiceError, match="1 MiB"):
        import_project("x" * 1_048_577)
    content = export_project(demo_roster())
    with pytest.raises(ServiceError):
        import_project(content + 'person,"unfinished')
