"""Profile-local, transactional revisions and reviewed solver candidates.

Every state change checks the revision inside the write transaction. Solver
work happens outside this module, then saves against the revision it read.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from .errors import ServiceError

Json = dict[str, Any]


@dataclass(frozen=True)
class State:
    id: str
    revision: int
    can_undo: bool
    roster: Json
    candidate: Json | None
    history: list[Json]


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds")


def _encode(value: Json) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


class Store:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.path = self.data_dir / "shiftrepair.sqlite3"
        is_new = not self.path.exists()
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS board (
                    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                    id TEXT NOT NULL,
                    revision INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS revisions (
                    revision INTEGER PRIMARY KEY,
                    parent_revision INTEGER REFERENCES revisions(revision),
                    roster_json TEXT NOT NULL,
                    action TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS candidate (
                    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                    id TEXT NOT NULL,
                    base_revision INTEGER NOT NULL REFERENCES revisions(revision),
                    result_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
        if is_new:
            self.path.chmod(0o600)

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
        finally:
            connection.close()

    @contextmanager
    def _transaction(self, *, write: bool = False) -> Iterator[sqlite3.Connection]:
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            try:
                yield connection
                connection.execute("COMMIT")
            except BaseException:
                connection.execute("ROLLBACK")
                raise

    def _read(self, connection: sqlite3.Connection) -> State | None:
        row = connection.execute(
            "SELECT board.id, board.revision, revisions.roster_json, revisions.parent_revision "
            "FROM board JOIN revisions ON revisions.revision = board.revision "
            "WHERE board.singleton = 1"
        ).fetchone()
        if row is None:
            return None
        pending = connection.execute("SELECT * FROM candidate WHERE singleton = 1").fetchone()
        candidate = None
        if pending is not None:
            candidate = {
                "id": pending["id"],
                "base_revision": pending["base_revision"],
                "result": json.loads(pending["result_json"]),
                "created_at": pending["created_at"],
            }
        history = [
            dict(entry)
            for entry in connection.execute(
                "SELECT revision, action, created_at FROM revisions "
                "ORDER BY revision DESC LIMIT 20"
            )
        ]
        return State(
            id=row["id"],
            revision=row["revision"],
            can_undo=row["parent_revision"] is not None,
            roster=json.loads(row["roster_json"]),
            candidate=candidate,
            history=history,
        )

    def get(self) -> State | None:
        with self._transaction() as connection:
            return self._read(connection)

    def _require(self, connection: sqlite3.Connection, expected_revision: int) -> State:
        state = self._read(connection)
        if state is None:
            raise ServiceError("board_missing", "Load an example or import a project first.", 404)
        if state.revision != expected_revision:
            raise ServiceError(
                "stale_revision",
                "The schedule changed. Refresh it and review the current revision before retrying.",
                409,
            )
        return state

    def _append(
        self,
        connection: sqlite3.Connection,
        state: State | None,
        roster: Json,
        action: str,
        parent_revision: int | None,
    ) -> State:
        revision = state.revision + 1 if state else 1
        connection.execute(
            "INSERT INTO revisions VALUES (?, ?, ?, ?, ?)",
            (revision, parent_revision, _encode(roster), action, _now()),
        )
        connection.execute(
            "INSERT INTO board VALUES (1, ?, ?) "
            "ON CONFLICT(singleton) DO UPDATE SET revision = excluded.revision",
            (state.id if state else uuid4().hex, revision),
        )
        connection.execute("DELETE FROM candidate WHERE singleton = 1")
        result = self._read(connection)
        assert result is not None
        return result

    def replace(
        self,
        roster: Json,
        action: str,
        expected_revision: int | None = None,
        *,
        reset: bool = False,
    ) -> State:
        with self._transaction(write=True) as connection:
            state = self._read(connection)
            if state is not None:
                if expected_revision is None and not reset:
                    raise ServiceError(
                        "revision_required",
                        "An active schedule exists. Supply its revision to replace it.",
                        409,
                    )
                if expected_revision is not None:
                    self._require(connection, expected_revision)
            elif expected_revision is not None:
                raise ServiceError("stale_revision", "There is no schedule at that revision.", 409)
            return self._append(
                connection, state, roster, action, state.revision if state else None
            )

    def mutate(
        self,
        expected_revision: int,
        transform: Callable[[State], Json],
        action: str,
    ) -> State:
        with self._transaction(write=True) as connection:
            state = self._require(connection, expected_revision)
            roster = transform(state)
            return self._append(connection, state, roster, action, state.revision)

    def save_candidate(self, expected_revision: int, result: Json) -> State:
        with self._transaction(write=True) as connection:
            self._require(connection, expected_revision)
            connection.execute(
                "INSERT INTO candidate VALUES (1, ?, ?, ?, ?) "
                "ON CONFLICT(singleton) DO UPDATE SET id = excluded.id, "
                "base_revision = excluded.base_revision, result_json = excluded.result_json, "
                "created_at = excluded.created_at",
                (uuid4().hex, expected_revision, _encode(result), _now()),
            )
            state = self._read(connection)
            assert state is not None
            return state

    @staticmethod
    def require_candidate(state: State, candidate_id: str) -> Json:
        candidate = state.candidate
        if (
            candidate is None
            or candidate["id"] != candidate_id
            or candidate["base_revision"] != state.revision
        ):
            raise ServiceError(
                "stale_candidate", "That repair is no longer current. Solve and review again.", 409
            )
        return candidate

    def discard(self, expected_revision: int, candidate_id: str) -> State:
        with self._transaction(write=True) as connection:
            state = self._require(connection, expected_revision)
            self.require_candidate(state, candidate_id)
            connection.execute("DELETE FROM candidate WHERE singleton = 1")
            result = self._read(connection)
            assert result is not None
            return result

    def undo(self, expected_revision: int) -> State:
        with self._transaction(write=True) as connection:
            state = self._require(connection, expected_revision)
            previous = connection.execute(
                "SELECT target.* FROM revisions current "
                "JOIN revisions target ON target.revision = current.parent_revision "
                "WHERE current.revision = ?",
                (state.revision,),
            ).fetchone()
            if previous is None:
                raise ServiceError("nothing_to_undo", "There is no earlier schedule to restore.", 409)
            # Skip the restored revision itself so repeated undo walks backwards.
            return self._append(
                connection,
                state,
                json.loads(previous["roster_json"]),
                f"Restored revision {previous['revision']}",
                previous["parent_revision"],
            )
