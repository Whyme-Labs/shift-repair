from __future__ import annotations

import csv
import io
from pathlib import Path

from fastapi.testclient import TestClient

from shiftrepair.api import create_app
from shiftrepair.csv_io import PROJECT_COLUMNS, export_project
from shiftrepair.examples import demo_roster

PREFIX = "/api/plugins/shiftrepair"


def test_http_repair_export_and_round_trip_into_a_new_profile(tmp_path: Path) -> None:
    with TestClient(create_app(tmp_path / "first")) as client:
        assert client.get(f"{PREFIX}/board").json() == {"board": None}
        board = client.post(f"{PREFIX}/demo", json={}).json()["board"]
        response = client.post(f"{PREFIX}/changes", json={
            "expected_revision": board["revision"],
            "changes": [{
                "type": "availability", "person_id": "asha", "date": "2026-11-09",
                "available": False,
            }],
        })
        assert response.status_code == 200
        board = response.json()["board"]
        response = client.get(f"{PREFIX}/export")
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_schedule"
        solved = client.post(
            f"{PREFIX}/solve", json={"expected_revision": board["revision"]}
        ).json()["board"]
        assert solved["candidate"]["result"]["changed_assignments"] == 2
        applied = client.post(f"{PREFIX}/apply", json={
            "expected_revision": solved["revision"], "candidate_id": solved["candidate"]["id"],
        }).json()["board"]
        assert not applied["validation"]
        content = client.get(f"{PREFIX}/export?kind=project").json()["content"]
        response = client.post(f"{PREFIX}/apply", json={
            "expected_revision": solved["revision"], "candidate_id": solved["candidate"]["id"],
        })
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "stale_revision"
    with TestClient(create_app(tmp_path / "second")) as client:
        imported = client.post(f"{PREFIX}/import", json={"content": content})
        assert imported.status_code == 200
        assert imported.json()["board"]["roster"] == applied["roster"]


def test_http_invalid_types_unknown_fields_and_nonexistent_board(tmp_path: Path) -> None:
    with TestClient(create_app(tmp_path)) as client:
        response = client.post(f"{PREFIX}/demo", json={"ignore_rules": True})
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_input"
        response = client.post(f"{PREFIX}/solve", json={"expected_revision": True})
        assert response.status_code == 422
        response = client.post(f"{PREFIX}/solve", json={"expected_revision": 1})
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "board_missing"
        assert client.get(f"{PREFIX}/export?kind=anything").status_code == 422


def test_excessive_json_nesting_is_a_422_without_changing_board(tmp_path: Path) -> None:
    rows = list(csv.DictReader(io.StringIO(export_project(demo_roster()))))
    rows[1]["roles"] = "[" * 20_000 + '"lead"' + "]" * 20_000
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=PROJECT_COLUMNS)
    writer.writeheader()
    writer.writerows(rows)
    with TestClient(create_app(tmp_path), raise_server_exceptions=False) as client:
        original = client.post(f"{PREFIX}/demo", json={}).json()
        response = client.post(f"{PREFIX}/import", json={
            "content": output.getvalue(), "expected_revision": original["board"]["revision"],
        })
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_csv"
        assert client.get(f"{PREFIX}/board").json() == original


def test_lone_unicode_surrogate_cannot_reach_storage(tmp_path: Path) -> None:
    data = demo_roster().model_dump()
    data["people"][0]["name"] = "Broken\ud800"
    # Explicit ASCII JSON encodes the malformed Unicode sequence as an escape.
    import json

    with TestClient(create_app(tmp_path), raise_server_exceptions=False) as client:
        response = client.post(
            f"{PREFIX}/roster", content=json.dumps({"roster": data}),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422
        response = client.post(
            f"{PREFIX}/import", content=json.dumps({"content": "Bad\ud800"}),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422
        assert client.get(f"{PREFIX}/board").json() == {"board": None}
