"""Exercise the native plugin boundary against the real scheduling service.

Hermes host APIs are test doubles here so the standalone project test suite does
not need a full Hermes checkout. The separate doctor/validate commands test the
actual host loader and capability registry.
"""

import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from shiftrepair.service import RosterService

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path, monkeypatch):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    # Own test module only. Runtime plugin code never mutates sys.modules.
    monkeypatch.setitem(sys.modules, name, module)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def host(monkeypatch, tmp_path):
    state = {"profile": "alpha", "resolutions": [], "events": []}

    def plugin_data_dir(plugin_id):
        state["resolutions"].append((state["profile"], plugin_id))
        path = tmp_path / state["profile"] / "plugin-data" / plugin_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def broadcast_plugin_event(plugin_id, event, payload):
        state["events"].append((plugin_id, event, payload))

    storage = types.ModuleType("plugins.plugin_storage")
    storage.plugin_data_dir = plugin_data_dir
    events = types.ModuleType("hermes_cli.plugin_events")
    events.broadcast_plugin_event = broadcast_plugin_event
    monkeypatch.setitem(sys.modules, "plugins.plugin_storage", storage)
    monkeypatch.setitem(sys.modules, "hermes_cli.plugin_events", events)
    return state


@pytest.fixture
def plugin(monkeypatch, host):
    return load_module("_shiftrepair_plugin_test", ROOT / "__init__.py", monkeypatch)


@pytest.fixture
def registered(plugin):
    class Context:
        def __init__(self):
            self.tools = {}

        def register_tool(self, **registration):
            self.tools[registration["name"]] = registration

    context = Context()
    plugin.register(context)
    return context.tools


@pytest.fixture
def call(registered):
    def invoke(name, arguments=None):
        result = registered[f"shiftrepair_{name}"]["handler"](
            arguments or {}, task_id="test-task"
        )
        assert isinstance(result, str)
        return json.loads(result)

    return invoke


def test_registration_is_complete_and_has_no_storage_side_effect(registered, host, plugin):
    expected = {
        "shiftrepair_get_board", "shiftrepair_load_demo", "shiftrepair_import_roster",
        "shiftrepair_change", "shiftrepair_solve", "shiftrepair_apply", "shiftrepair_discard",
        "shiftrepair_undo", "shiftrepair_export", "shiftrepair_import_csv",
    }
    assert set(registered) == expected
    assert plugin.RosterService is RosterService
    manifest = (ROOT / "plugin.yaml").read_text()
    for name, definition in registered.items():
        assert f"  - {name}\n" in manifest
        assert definition["toolset"] == "shiftrepair"
        assert definition["schema"]["name"] == name
        assert definition["schema"]["parameters"]["additionalProperties"] is False
    assert host["resolutions"] == []
    assert host["events"] == []


def test_tool_arguments_are_strict_and_fail_before_storage(call, host):
    assert call("get_board", {"unexpected": True})["error"]["code"] == "invalid_arguments"
    assert call("solve", {"expected_revision": "1"})["error"]["code"] == "invalid_arguments"
    assert call("import_csv", {"content": "x" * 262145})["error"]["code"] == "invalid_arguments"
    assert call("change", {"expected_revision": 1, "changes": [
        {"type": "availability", "person_id": "asha", "date": "2026-11-09", "available": "false"}
    ]})["error"]["code"] == "invalid_arguments"
    assert host["resolutions"] == []


def test_demo_reset_requires_explicit_true(call):
    assert call("load_demo", {"confirm_reset": False})["error"]["code"] == "confirmation_required"
    assert call("get_board")["board"] is None
    assert call("load_demo", {"confirm_reset": "true"})["error"]["code"] == "invalid_arguments"


def test_tool_repair_apply_and_stale_write_protection(call, host):
    board = call("load_demo", {"confirm_reset": True})["board"]
    before = dict(board["roster"]["baseline"])
    first = board["roster"]["slots"][0]
    person_id = before[first["id"]]
    changed = call("change", {"expected_revision": board["revision"], "changes": [
        {"type": "availability", "person_id": person_id, "date": first["date"], "available": False}
    ]})["board"]
    assert changed["validation"]
    stale = call("solve", {"expected_revision": board["revision"]})
    assert stale["ok"] is False
    solved = call("solve", {"expected_revision": changed["revision"]})["board"]
    assert solved["roster"]["baseline"] == before
    candidate = solved["candidate"]
    assert candidate["result"]["status"] in {"OPTIMAL", "FEASIBLE"}
    assert candidate["result"]["violations"] == []
    applied = call("apply", {
        "expected_revision": solved["revision"], "candidate_id": candidate["id"],
    })["board"]
    assert applied["roster"]["baseline"] == candidate["result"]["assignment"]
    assert applied["validation"] == []
    assert applied["candidate"] is None
    assert call("export")["ok"] is True
    assert all(item[0:2] == ("shiftrepair", "board.updated") for item in host["events"])
    assert all(set(payload) == {"revision"} for _, _, payload in host["events"])


def test_tool_resolves_active_profile_on_each_call(call, host):
    alpha = call("load_demo", {"confirm_reset": True})["board"]
    host["profile"] = "beta"
    assert call("get_board")["board"] is None
    beta = call("load_demo", {"confirm_reset": True})["board"]
    assert beta["id"] != alpha["id"]
    host["profile"] = "alpha"
    assert call("get_board")["board"]["id"] == alpha["id"]
    assert ("alpha", "shiftrepair") in host["resolutions"]
    assert ("beta", "shiftrepair") in host["resolutions"]


def test_native_rest_and_tools_share_storage_and_profile_scope(call, host, monkeypatch):
    backend = load_module(
        "_shiftrepair_dashboard_test", ROOT / "dashboard" / "plugin_api.py", monkeypatch
    )
    app = FastAPI()
    app.include_router(backend.router, prefix="/api/plugins/shiftrepair")
    with TestClient(app) as client:
        assert client.get("/api/plugins/shiftrepair/board").json() == {"board": None}
        board = client.post("/api/plugins/shiftrepair/demo", json={}).json()["board"]
        assert call("get_board")["board"] == board
        candidate = call("solve", {"expected_revision": board["revision"]})["board"]
        fetched = client.get("/api/plugins/shiftrepair/board").json()["board"]
        assert fetched["candidate"]["id"] == candidate["candidate"]["id"]
        host["profile"] = "beta"
        assert client.get("/api/plugins/shiftrepair/board").json() == {"board": None}
        assert call("get_board")["board"] is None
        host["profile"] = "alpha"
        assert client.get("/api/plugins/shiftrepair/board").json()["board"]["id"] == board["id"]
