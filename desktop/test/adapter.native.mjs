import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { JSDOM } from "jsdom";
import { act } from "react";

const sdkUrl = new URL("../.test-build/native-host.mjs", import.meta.url).href;
const loader = registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "@hermes/plugin-sdk" ? { url: sdkUrl, shortCircuit: true } : nextResolve(specifier, context);
  },
});
const sdk = await import(sdkUrl);
const { default: plugin } = await import("../plugin.js");
let dom, createRoot, root, container;
const mountedContexts = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const board = (name = "Adapter test board") => ({
  id: "adapter-test", revision: 1, can_undo: false,
  roster: { name, week_start: "2026-11-09", people: [{ id: "person", name: "Person", roles: ["lead"], available_days: ["2026-11-09"], max_assignments: 1 }], slots: [{ id: "slot", date: "2026-11-09", shift: "AM", role: "lead" }], baseline: { slot: "person" }, pins: {} },
  validation: [], candidate: null, history: [{ revision: 1, action: "Created", created_at: "2026-11-09T12:00:00Z" }],
});
const file = { filename: "schedule.csv", content: "date,name\n2026-11-09,Person\n", mime_type: "text/csv" };

function installed(options) {
  const context = sdk.makeContext(options);
  plugin.register(context.ctx);
  mountedContexts.push(context);
  const pane = context.contributions.get("page").render();
  return { ...context, pane, bindings: pane.props.bindings };
}

async function waitFor(check, message) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (check()) return;
    await act(async () => { await pause(10); });
  }
  assert.fail(message);
}

before(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1", pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import("react-dom/client"));
});
beforeEach(() => {
  sdk.resetHost();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  for (const context of mountedContexts.splice(0)) context.disable();
  await act(async () => { root.unmount(); });
  container.remove();
});
after(() => { dom.window.close(); loader.deregister(); });

test("the actual compiled entry imports only the public SDK and React, with no runtime loader escapes", async () => {
  const text = await readFile(new URL("../plugin.js", import.meta.url), "utf8");
  const source = ts.createSourceFile("plugin.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imports = [];
  const inspect = (node) => {
    if (ts.isImportDeclaration(node)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      assert.notEqual(node.expression.kind, ts.SyntaxKind.ImportKeyword, "Native entry must not import remote chunks");
      if (ts.isIdentifier(node.expression)) assert.ok(!["eval", "require", "Function"].includes(node.expression.text), "Native entry must not bypass its import surface");
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) assert.notEqual(node.expression.text, "Function");
    ts.forEachChild(node, inspect);
  };
  inspect(source);
  assert.deepEqual([...new Set(imports)].sort(), ["@hermes/plugin-sdk", "react", "react/jsx-runtime"]);
  const context = installed();
  assert.equal(plugin.id, "shiftrepair");
  assert.equal(context.contributions.get("page").area, "routes");
  assert.equal(context.contributions.get("page").data.path, "/shiftrepair");
  assert.deepEqual(context.contributions.get("nav").data, { path: "/shiftrepair", label: "ShiftRepair", codicon: "calendar" });
  context.disable();
  assert.equal(context.contributions.size, 0);
});

test("the native adapter forwards the supported REST signature and decodes wrapped transport errors", async () => {
  const context = installed({ request: async (path) => {
    if (path === "/apply") throw new Error('Error invoking remote method: Error: 409: {"detail":{"code":"stale_candidate","message":"Review the current proposal."}}');
    return { board: board() };
  } });
  await context.bindings.rest("/board", { timeoutMs: 15000 });
  await assert.rejects(context.bindings.rest("/apply", { method: "POST", body: { expected_revision: 1, candidate_id: "candidate" }, timeoutMs: 30000 }), (error) => error.status === 409 && error.code === "stale_candidate" && error.message === "Review the current proposal.");
  assert.deepEqual(context.calls[0], { path: "/board", options: { timeoutMs: 15000 } });
  assert.deepEqual(context.calls[1].options, { method: "POST", body: { expected_revision: 1, candidate_id: "candidate" }, timeoutMs: 30000 });
});

test("folder cancellation is the supported null result and never writes or reports saved", async () => {
  let writes = 0;
  const context = installed({ files: { requestFolder: async () => ({ ok: true, folder: null }), writeText: async () => { writes++; throw new Error("Unexpected write"); } } });
  assert.equal(await context.bindings.saveFile(file), "cancelled");
  assert.equal(writes, 0);
});

test("file writes use the opaque grant ID, safe relative names and exclusive creation", async () => {
  let captured;
  const context = installed({ files: {
    requestFolder: async () => ({ ok: true, folder: { id: "opaque-grant", name: "Exports", path: "/display-only/path" } }),
    writeText: async (...args) => { captured = args; return { ok: true, path: args[1], size: 44, mtimeMs: 100 }; },
  } });
  assert.equal(await context.bindings.saveFile({ ...file, filename: "../../schedule.csv" }), "saved");
  assert.equal(captured[0], "opaque-grant");
  assert.match(captured[1], /^[A-Za-z0-9._-]+\.csv$/);
  assert.equal(captured[1].includes("/"), false);
  assert.equal(captured[2], file.content);
  assert.deepEqual(captured[3], { exclusive: true });
});

test("unavailable or refused file operations remain errors rather than successful exports", async () => {
  const unavailable = installed({ files: { requestFolder: async () => ({ ok: false, error: "unavailable", message: "Plugin file access is unavailable." }) } });
  await assert.rejects(unavailable.bindings.saveFile(file), /file access is unavailable/);
  const refused = installed({ files: {
    requestFolder: async () => ({ ok: true, folder: { id: "grant", name: "Exports", path: "/ignored" } }),
    writeText: async () => ({ ok: false, error: "exists", message: "That file already exists." }),
  } });
  await assert.rejects(refused.bindings.saveFile(file), /already exists/);
});

test("switching connections or disabling during a folder picker cancels the later write", async () => {
  for (const transition of [() => sdk.activate("default", 1), (context) => context.disable()]) {
    sdk.resetHost();
    const picker = deferred();
    let writes = 0;
    const context = installed({ files: { requestFolder: () => picker.promise, writeText: async () => { writes++; throw new Error("Unexpected write"); } } });
    const pending = context.bindings.saveFile(file);
    transition(context);
    picker.resolve({ ok: true, folder: { id: "grant", name: "Exports", path: "/ignored" } });
    assert.equal(await pending, "cancelled");
    assert.equal(writes, 0);
  }
});

test("tracked event listeners and pollers retire on unmount and plugin disable", async () => {
  const context = installed({ request: async () => ({ board: board() }) });
  await act(async () => { root.render(context.pane); });
  await waitFor(() => container.textContent.includes("Adapter test board"), "Native route should read through ctx.rest");
  assert.equal(context.listeners.get("plugin.shiftrepair.board.updated").size, 1);
  assert.equal(context.timers.size, 1);
  assert.equal([...context.timers][0].intervalMs, 3000);
  const before = context.calls.length;
  await act(async () => { context.emit("plugin.shiftrepair.board.updated"); });
  assert.equal(context.calls.length, before + 1);
  context.disable();
  const atDisable = context.calls.length;
  await act(async () => { context.emit("plugin.shiftrepair.board.updated"); context.tick(); });
  assert.equal(context.calls.length, atDisable);
  assert.equal(context.listeners.size, 0);
  assert.equal(context.timers.size, 0);
  await assert.rejects(context.bindings.rest("/board"), /active Hermes connection changed/);
  await act(async () => { root.render(null); });
  assert.equal(context.listeners.size, 0);
});

test("the compiled native view resets on same-profile activation and rejects late data", async () => {
  const old = deferred();
  let reads = 0;
  const context = installed({ request: async () => ++reads === 1 ? old.promise : { board: board("Second connection board") } });
  await act(async () => { root.render(context.pane); });
  assert.match(container.textContent, /Opening your schedule/);
  await act(async () => { sdk.activate("default", 7); });
  await waitFor(() => container.textContent.includes("Second connection board"), "The native activation hook should remount the view even when the profile name is unchanged");
  await act(async () => { old.resolve({ board: board("First connection board") }); });
  assert.equal(container.textContent.includes("First connection board"), false);
  assert.equal(context.listeners.get("plugin.shiftrepair.board.updated").size, 1);
  assert.equal(context.timers.size, 1);
  await act(async () => { sdk.activate("another-profile", 8); });
  await waitFor(() => reads === 3, "Changing the profile should load a fresh view");
  assert.equal(context.timers.size, 1);
});
