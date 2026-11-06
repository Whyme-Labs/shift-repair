import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { ShiftRepairApp } from "../.test-build/App.mjs";
import { createFetchRest } from "../.test-build/api.mjs";

let dom, createRoot, root, container, backend, dataDir, base, rest;
let exported = [];
const project = fileURLToPath(new URL("../../", import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, message, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await act(async () => { await pause(20); });
  }
  assert.fail(`${message}\nRendered content: ${container?.textContent?.slice(-3500)}`);
}

const button = (name) => [...container.querySelectorAll("button")].find((node) => node.textContent.trim() === name || node.getAttribute("aria-label") === name);
const availabilityButton = (name, day, available) => [...container.querySelectorAll("button")].find((node) => {
  const label = node.getAttribute("aria-label") || "";
  return label.startsWith(`${name},`) && label.includes(day) && label.endsWith(`Mark ${available ? "unavailable" : "available"}.`);
});

async function click(node) {
  assert.ok(node, "Expected an interactive element");
  assert.equal(node.disabled, false, "Expected the element to be enabled");
  await act(async () => { node.click(); });
}

async function mount(adapter = rest, extra = {}) {
  await act(async () => { root.render(React.createElement(ShiftRepairApp, { rest: adapter, saveFile: async (file) => { exported.push(file); return "saved"; }, mode: "preview", ...extra })); });
  await waitFor(() => !container.textContent.includes("Opening your schedule"), "The board should finish loading");
}

before(async () => {
  const python = process.env.SHIFTREPAIR_TEST_PYTHON || resolve(project, ".venv/bin/python");
  assert.ok(existsSync(python), "Install the Python preview dependencies first, or set SHIFTREPAIR_TEST_PYTHON to the Python executable.");
  dataDir = await mkdtemp(resolve(tmpdir(), "shiftrepair-ui-"));
  backend = spawn(python, ["-c", "import sys; from pathlib import Path; import uvicorn; from shiftrepair.api import create_app; uvicorn.run(create_app(Path(sys.argv[1])),host='127.0.0.1',port=0)", dataDir], { cwd: project, stdio: ["ignore", "pipe", "pipe"] });
  base = await new Promise((resolve, reject) => {
    let logs = "";
    const timer = setTimeout(() => reject(new Error(`Preview server failed to start: ${logs}`)), 12000);
    const observe = (chunk) => {
      logs += chunk.toString();
      const match = logs.match(/Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    };
    backend.stderr.on("data", observe);
    backend.stdout.on("data", observe);
    backend.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Preview exited ${code}: ${logs}`)); });
  });
  rest = createFetchRest(`${base}/api/plugins/shiftrepair`);
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: base, pretendToBeVisual: true });
  for (const name of ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLDialogElement", "Event", "MouseEvent", "KeyboardEvent"]) globalThis[name] = name === "window" ? dom.window : name === "document" ? dom.window.document : dom.window[name];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (!dom.window.HTMLDialogElement.prototype.showModal) dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  if (!dom.window.HTMLDialogElement.prototype.close) dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  ({ createRoot } = await import("react-dom/client"));
});

beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  exported = [];
});

afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); });
after(async () => {
  dom?.window.close();
  if (backend && backend.exitCode === null) {
    const exited = new Promise((resolve) => backend.once("exit", resolve));
    backend.kill("SIGTERM");
    await exited;
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test("real backend flow loads the example, repairs two positions, applies, exports and undoes", async () => {
  await mount();
  await click(button("Open the example week"));
  await waitFor(() => !!button("Availability & limits"), "The example should render");
  await click(button("Availability & limits"));
  await click(availabilityButton("Asha", "Mon", true));
  await waitFor(() => container.textContent.includes("Rules saved"), "Availability should be persisted");
  const changed = (await rest("/board")).board;
  assert.ok(changed.validation.length > 0);
  assert.equal(button("Export schedule").disabled, true);
  assert.equal(button("Export project data").disabled, true);
  await click(button("Find a repair"));
  await waitFor(() => !!button("Apply 2 changes"), "The real solver should find the expected two-change repair");
  assert.match(container.textContent, /Minimum changes proved/);
  assert.equal(container.querySelectorAll(".sr-assignment-changed").length, 2);
  const proposed = (await rest("/board")).board;
  assert.deepEqual(proposed.roster.baseline, changed.roster.baseline, "Solving must leave the baseline intact");
  await click(button("Apply 2 changes"));
  await waitFor(() => container.textContent.includes("Repair applied."), "The repair should be applied");
  const applied = (await rest("/board")).board;
  assert.equal(applied.validation.length, 0);
  assert.notDeepEqual(applied.roster.baseline, changed.roster.baseline);
  await click(button("Export schedule"));
  await waitFor(() => exported.length === 1, "Export should provide a real CSV");
  assert.equal(exported[0].content.trim().split(/\r?\n/).length, 29);
  assert.match(exported[0].content, /date,shift,role,person_id,name,pinned/);
  await click(button("Undo"));
  await waitFor(() => container.textContent.includes("Previous content restored"), "Undo should finish");
  assert.deepEqual((await rest("/board")).board.roster.baseline, changed.roster.baseline);
});

test("an infeasible real roster cannot be applied and the cover form resolves it", async () => {
  let board = (await rest("/demo", { method: "POST", body: {} })).board;
  board = (await rest("/changes", { method: "POST", body: { expected_revision: board.revision, changes: [
    { type: "availability", person_id: "asha", date: "2026-11-09", available: false },
    { type: "availability", person_id: "chen", date: "2026-11-09", available: false },
  ] } })).board;
  await mount();
  await click(button("Find a repair"));
  await waitFor(() => container.textContent.includes("No schedule fits these rules"), "Infeasibility should be visible");
  assert.equal([...container.querySelectorAll("button")].some((node) => /^Apply \d/.test(node.textContent)), false);
  assert.ok(container.querySelector(".sr-conflict-list li")?.textContent.length > 20);
  await click(button("Add qualified cover"));
  assert.equal(container.querySelectorAll("dialog input[type='checkbox']:checked").length, 0, "A staffing shortage must not infer a new person's qualifications or availability");
  const name = container.querySelector("input[placeholder='Name of the person covering']");
  assert.ok(name);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(name, "Inez");
    name.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await click(button("Add cover"));
  await waitFor(() => container.textContent.includes("explicitly select at least one role and available day"), "Unconfirmed qualifications and availability should block the form");
  assert.equal((await rest("/board")).board.roster.people.length, board.roster.people.length);
  const checks = [...container.querySelectorAll("dialog input[type='checkbox']")];
  await click(checks.find((input) => input.parentElement.textContent.trim() === "Lead"));
  await click(checks.find((input) => input.parentElement.textContent.trim().startsWith("Mon")));
  await click(button("Add cover"));
  await waitFor(() => !container.querySelector("dialog"), "A qualified cover person should be saved");
  const withCover = (await rest("/board")).board;
  assert.ok(withCover.roster.people.find((person) => person.name === "Inez"));
  await click(button("Find a repair"));
  await waitFor(() => !!button("Apply 1 change"), "The real relief scenario should need one assignment change");
});

test("an old proposal is rejected after an external edit and the refreshed version is rendered", async () => {
  let board = (await rest("/demo", { method: "POST", body: {} })).board;
  board = (await rest("/changes", { method: "POST", body: { expected_revision: board.revision, changes: [{ type: "availability", person_id: "asha", date: "2026-11-09", available: false }] } })).board;
  await mount();
  await click(button("Find a repair"));
  await waitFor(() => !!button("Apply 2 changes"), "A proposal should be ready");
  const latest = (await rest("/board")).board;
  const updated = (await rest("/changes", { method: "POST", body: { expected_revision: latest.revision, changes: [{ type: "capacity", person_id: "hana", max_assignments: 6 }] } })).board;
  // Click before polling. The server, not a hidden disabled button, rejects the old identity.
  await click(button("Apply 2 changes"));
  await waitFor(() => container.textContent.includes("Someone changed this schedule"), "Stale writes should produce a useful conflict message");
  assert.equal((await rest("/board")).board.revision, updated.revision);
  assert.equal(button("Apply 2 changes"), undefined);
  assert.ok(button(`Revision ${updated.revision}`));
});

test("delayed reads from an old connection cannot replace the current profile view", async () => {
  const first = (await rest("/board")).board;
  let scope = "first";
  let release;
  let reads = 0;
  const second = structuredClone(first);
  second.roster.name = "Second profile board";
  const delayed = async () => {
    reads++;
    if (reads === 1) return new Promise((resolve) => { release = resolve; });
    return { board: second };
  };
  await act(async () => { root.render(React.createElement(ShiftRepairApp, { rest: delayed, saveFile: async () => "saved", mode: "preview", getScopeKey: () => scope })); });
  assert.ok(container.textContent.includes("Opening your schedule"));
  scope = "second";
  await act(async () => { release({ board: first }); });
  assert.equal(container.textContent.includes(first.roster.name), false);
  await waitFor(() => container.textContent.includes("Second profile board"), "Polling should load the current scope", 5000);
  assert.equal(container.textContent.includes(first.roster.name), false);
});
