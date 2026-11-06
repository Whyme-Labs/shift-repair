from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from typing import Any

import pytest

from shiftrepair.errors import ServiceError
from shiftrepair.service import RosterService

MONDAY = "2026-11-09"


def absence(person_id: str = "asha") -> dict[str, Any]:
    return {"type": "availability", "person_id": person_id, "date": MONDAY, "available": False}


def test_complete_repair_workflow_and_repeated_undo(tmp_path: Path) -> None:
    service = RosterService(tmp_path)
    initial = service.load_demo()
    changed = service.change(initial["revision"], [absence()])
    assert changed["validation"]
    solved = service.solve(changed["revision"])
    assert solved["revision"] == changed["revision"]
    assert solved["roster"]["baseline"] == initial["roster"]["baseline"]
    result = solved["candidate"]["result"]
    assert result["status"] == "OPTIMAL" and result["changed_assignments"] == 2
    applied = service.apply(solved["revision"], solved["candidate"]["id"])
    assert not applied["validation"] and applied["candidate"] is None
    assert applied["roster"]["baseline"] == result["assignment"]
    assert len(service.export_csv()["content"].splitlines()) == 29
    assert service.export_csv("project")["content"].startswith("record_type,")

    undone = service.undo(applied["revision"])
    assert undone["revision"] > applied["revision"]
    assert undone["roster"] == changed["roster"]
    undone_again = service.undo(undone["revision"])
    assert undone_again["roster"] == initial["roster"]
    with pytest.raises(ServiceError, match="no earlier"):
        service.undo(undone_again["revision"])


def test_a_second_service_sees_persisted_candidates_and_edits(tmp_path: Path) -> None:
    first, second = RosterService(tmp_path), RosterService(tmp_path)
    board = first.load_demo()
    assert second.get_board() == board
    candidate = second.solve(board["revision"])
    assert first.get_board() == candidate
    assert RosterService(tmp_path).get_board() == candidate


def test_stale_edit_and_stale_candidate_cannot_overwrite(tmp_path: Path) -> None:
    service = RosterService(tmp_path)
    initial = service.load_demo()
    solved = service.solve(initial["revision"])
    changed = service.change(initial["revision"], [absence()])
    assert changed["candidate"] is None
    with pytest.raises(ServiceError) as exc:
        service.apply(solved["revision"], solved["candidate"]["id"])
    assert exc.value.code == "stale_revision"
    with pytest.raises(ServiceError) as exc:
        service.apply(changed["revision"], solved["candidate"]["id"])
    assert exc.value.code == "stale_candidate"
    assert service.get_board() == changed


def test_second_candidate_replaces_first_and_discard_is_enforced(tmp_path: Path) -> None:
    service = RosterService(tmp_path)
    board = service.load_demo()
    first = service.solve(board["revision"])
    second = service.solve(board["revision"])
    assert first["candidate"]["id"] != second["candidate"]["id"]
    with pytest.raises(ServiceError) as exc:
        service.apply(board["revision"], first["candidate"]["id"])
    assert exc.value.code == "stale_candidate"
    discarded = service.discard(board["revision"], second["candidate"]["id"])
    assert discarded["candidate"] is None
    with pytest.raises(ServiceError):
        service.apply(board["revision"], second["candidate"]["id"])


def test_concurrent_writers_have_one_winner(tmp_path: Path) -> None:
    service = RosterService(tmp_path)
    board = service.load_demo()
    barrier = Barrier(2)

    def update(person_id: str) -> tuple[str, int]:
        other = RosterService(tmp_path)
        barrier.wait(timeout=5)
        try:
            saved = other.change(board["revision"], [absence(person_id)])
            return "saved", saved["revision"]
        except ServiceError as exc:
            return exc.code, exc.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(update, ["asha", "chen"]))
    assert sorted(outcomes) == [("saved", 2), ("stale_revision", 409)]
    current = service.get_board()
    assert current is not None and current["revision"] == 2


def test_solver_cannot_save_after_a_concurrent_edit(tmp_path: Path, monkeypatch: Any) -> None:
    from shiftrepair import service as service_module

    service = RosterService(tmp_path)
    board = service.load_demo()
    original_solve = service_module.solver.solve

    def interleaved_solve(roster: Any) -> Any:
        service.change(board["revision"], [absence()])
        return original_solve(roster)

    monkeypatch.setattr(service_module.solver, "solve", interleaved_solve)
    with pytest.raises(ServiceError) as exc:
        service.solve(board["revision"])
    assert exc.value.code == "stale_revision"
    current = service.get_board()
    assert current is not None and current["revision"] == 2 and current["candidate"] is None


def test_invalid_batch_is_atomic_and_unsupported_changes_are_rejected(tmp_path: Path) -> None:
    service = RosterService(tmp_path)
    board = service.load_demo()
    with pytest.raises(ServiceError) as exc:
        service.change(board["revision"], [absence(), absence("ghost")])
    assert exc.value.code == "unknown_person"
    assert service.get_board() == board
    with pytest.raises(ServiceError):
        service.change(board["revision"], [{"type": "allow_overtime", "hours": 2}])
    with pytest.raises(ServiceError):
        service.change(board["revision"], [{**absence(), "available": "false"}])
    with pytest.raises(ServiceError):
        service.change(True, [absence()])
    assert service.get_board() == board


def test_no_export_or_apply_of_an_unresolved_schedule(tmp_path: Path) -> None:
    service = RosterService(tmp_path)
    board = service.load_demo()
    board = service.change(board["revision"], [absence(), absence("chen")])
    with pytest.raises(ServiceError) as exc:
        service.export_csv()
    assert exc.value.code == "invalid_schedule"
    solved = service.solve(board["revision"])
    assert solved["candidate"]["result"]["status"] == "INFEASIBLE"
    with pytest.raises(ServiceError) as exc:
        service.apply(solved["revision"], solved["candidate"]["id"])
    assert exc.value.code == "repair_unresolved"
    assert service.get_board() == solved


def test_apply_rechecks_assignment_independently(tmp_path: Path) -> None:
    service = RosterService(tmp_path)
    board = service.load_demo()
    solved = service.solve(board["revision"])
    result = solved["candidate"]["result"]
    # A valid-shaped stored result is still untrusted at application time.
    result["assignment"]["2026-11-09:AM:lead"] = "gopal"
    poisoned = service.store.save_candidate(board["revision"], result)
    assert poisoned.candidate is not None
    with pytest.raises(ServiceError) as exc:
        service.apply(board["revision"], poisoned.candidate["id"])
    assert exc.value.code == "invalid_repair"
    current = service.get_board()
    assert current is not None and current["roster"] == board["roster"]


def test_demo_reset_and_import_preserve_undo_and_require_revision(tmp_path: Path) -> None:
    service = RosterService(tmp_path)
    first = service.load_demo()
    changed = service.change(first["revision"], [absence()])
    reset = service.load_demo()
    assert reset["id"] == first["id"] and reset["revision"] == 3
    restored = service.undo(reset["revision"])
    assert restored["roster"] == changed["roster"]
    with pytest.raises(ServiceError) as exc:
        service.import_roster(first["roster"])
    assert exc.value.code == "revision_required"
    imported = service.import_roster(first["roster"], restored["revision"])
    assert imported["roster"] == first["roster"]


def test_notification_failure_does_not_report_a_failed_commit(tmp_path: Path, caplog: Any) -> None:
    def failed_notification(board: dict[str, Any]) -> None:
        raise RuntimeError("Simulated event transport outage")

    service = RosterService(tmp_path, on_change=failed_notification)
    board = service.load_demo()
    assert RosterService(tmp_path).get_board() == board
    assert "board update notification failed" in caplog.text
