"""Focused regressions for undo state and exact reviewed-candidate application."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest
from fastapi.testclient import TestClient

from shiftrepair.api import create_app
from shiftrepair.checker import check
from shiftrepair.errors import ServiceError
from shiftrepair.models import Roster, SolveResult
from shiftrepair.service import RosterService

PREFIX = "/api/plugins/shiftrepair"


def test_undo_availability_follows_restore_chain_after_audit_history_is_capped(
    tmp_path: Path,
) -> None:
    service = RosterService(tmp_path)
    initial = service.load_demo()
    assert initial["can_undo"] is False
    board = initial
    # Retaining audit entries is different from having content left to restore.
    # Cross the documented 20-entry display cap before exhausting the real chain.
    for index in range(22):
        board = service.change(
            board["revision"],
            [{"type": "capacity", "person_id": "asha", "max_assignments": 3 + index % 2}],
        )
        assert board["can_undo"] is True
    assert len(board["history"]) == 20
    for remaining in range(21, -1, -1):
        board = service.undo(board["revision"])
        assert board["can_undo"] is (remaining > 0)
    assert board["roster"] == initial["roster"]
    assert len(board["history"]) == 20
    assert RosterService(tmp_path).get_board() == board
    with TestClient(create_app(tmp_path)) as client:
        assert client.get(f"{PREFIX}/board").json()["board"]["can_undo"] is False
        response = client.post(f"{PREFIX}/undo", json={"expected_revision": board["revision"]})
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "nothing_to_undo"
    assert service.get_board() == board


def test_new_edit_after_undo_restores_the_branch_without_reviving_abandoned_content(
    tmp_path: Path,
) -> None:
    service = RosterService(tmp_path)
    initial = service.load_demo()
    changed = service.change(
        initial["revision"],
        [{"type": "capacity", "person_id": "asha", "max_assignments": 3}],
    )
    restored = service.undo(changed["revision"])
    assert restored["can_undo"] is False
    branch = service.change(
        restored["revision"],
        [{"type": "capacity", "person_id": "ben", "max_assignments": 3}],
    )
    assert branch["can_undo"] is True
    again = service.undo(branch["revision"])
    assert again["roster"] == initial["roster"]
    assert again["can_undo"] is False


@pytest.mark.parametrize("corruption", ["omitted_diff", "incorrect_source", "malformed_result"])
def test_apply_rejects_candidate_metadata_drift_atomically(tmp_path: Path, corruption: str) -> None:
    service = RosterService(tmp_path)
    board = service.load_demo()
    proposed = service.solve(board["revision"])
    result = proposed["candidate"]["result"]
    if corruption == "malformed_result":
        result["optimal"] = "yes"
    else:
        # Swapping two qualified people is feasible. The checker alone cannot
        # detect a stale or missing description of what the user reviewed.
        first, second = "2026-11-09:AM:lead", "2026-11-09:PM:lead"
        result["assignment"][first], result["assignment"][second] = "ben", "asha"
        if corruption == "incorrect_source":
            result.update(
                status="FEASIBLE",
                optimal=False,
                changed_assignments=2,
                changes=[
                    {"slot_id": first, "from_person_id": "chen", "to_person_id": "ben"},
                    {"slot_id": second, "from_person_id": "ben", "to_person_id": "asha"},
                ],
            )
        SolveResult.model_validate(result)
        assert not check(Roster.model_validate(board["roster"]), result["assignment"])
    stored = service.store.save_candidate(board["revision"], result)
    assert stored.candidate is not None
    before = service.get_board()
    with pytest.raises(ServiceError) as error:
        service.apply(board["revision"], stored.candidate["id"])
    assert error.value.code == "invalid_repair"
    assert service.get_board() == before


def test_concurrent_apply_and_candidate_replacement_have_one_winner(tmp_path: Path) -> None:
    service = RosterService(tmp_path)
    board = service.load_demo()
    proposed = service.solve(board["revision"])
    old_id = proposed["candidate"]["id"]
    barrier = Barrier(2)

    def operate(action: str) -> tuple[str, int]:
        other = RosterService(tmp_path)
        barrier.wait(timeout=5)
        try:
            if action == "apply":
                value = other.apply(board["revision"], old_id)
            else:
                value = other.solve(board["revision"])
            return action, value["revision"]
        except ServiceError as exc:
            return exc.code, exc.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        apply_result, replace_result = list(pool.map(operate, ["apply", "replace"]))
    current = service.get_board()
    assert current is not None
    if apply_result[0] == "apply":
        assert apply_result == ("apply", 2)
        assert replace_result == ("stale_revision", 409)
        assert current["revision"] == 2 and current["candidate"] is None
        assert current["roster"]["baseline"] == proposed["candidate"]["result"]["assignment"]
    else:
        assert apply_result == ("stale_candidate", 409)
        assert replace_result == ("replace", 1)
        assert current["revision"] == 1
        assert current["candidate"]["id"] != old_id
        assert current["roster"] == board["roster"]
