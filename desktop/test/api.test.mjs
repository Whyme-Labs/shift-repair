import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createFetchRest, isStaleError, normalizeSdkError } from "../.test-build/api.mjs";

test("REST preserves expected revision and candidate identity in the real route format", async () => {
  let captured;
  const rest = createFetchRest("/api/plugins/shiftrepair", async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ board: null }), { status: 200 });
  });
  await rest("/apply", { method: "POST", body: { expected_revision: 7, candidate_id: "known-candidate" } });
  assert.equal(captured.url, "/api/plugins/shiftrepair/apply");
  assert.equal(captured.options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(captured.options.body), { expected_revision: 7, candidate_id: "known-candidate" });
});

test("backend stale revision errors keep their human message and conflict status", async () => {
  const rest = createFetchRest("/api/plugins/shiftrepair", async () => new Response(JSON.stringify({ detail: { code: "stale_revision", message: "Expected revision 3, current revision is 4." } }), { status: 409 }));
  await assert.rejects(rest("/apply"), (error) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.status, 409);
    assert.equal(error.code, "stale_revision");
    assert.equal(isStaleError(error), true);
    assert.match(error.message, /current revision is 4/);
    return true;
  });
});

test("native SDK transport errors decode structured backend details", () => {
  const error = new Error('Error invoking remote method: Error: 409: {"detail":{"code":"stale_revision","message":"The candidate is stale."}}');
  error.statusCode = 409;
  const normalized = normalizeSdkError(error);
  assert.equal(normalized.message, "The candidate is stale.");
  assert.equal(normalized.status, 409);
  assert.equal(isStaleError(normalized), true);
  assert.equal(normalizeSdkError(new Error("Connection refused")).message, "Connection refused");
});

test("IPC-wrapped HTTP errors preserve status without relying on an Error subclass", () => {
  const normalized = normalizeSdkError({ message: 'Error invoking remote method: Error: 409: {"detail":{"code":"stale_revision","message":"The schedule changed."}}' });
  assert.equal(normalized.status, 409);
  assert.equal(normalized.message, "The schedule changed.");
  assert.equal(isStaleError({ status: 409, message: "The schedule changed." }), true);
  assert.equal(isStaleError(new ApiError("The revision limit was exceeded.", 422, "invalid_input")), false);
  assert.equal(isStaleError(new Error("This roster has a qualification conflict.")), false);
});

test("HTTP failures and invalid response bodies cannot look like successful board reads", async () => {
  const badBody = createFetchRest("/api/plugins/shiftrepair", async () => new Response("proxy unavailable", { status: 502 }));
  await assert.rejects(badBody("/board"), /HTTP 502/);
  const empty = createFetchRest("/api/plugins/shiftrepair", async () => new Response("null", { status: 200 }));
  await assert.rejects(empty("/board"), /empty response/);
});

test("timeouts tell the user to refresh before repeating a write", async () => {
  const rest = createFetchRest("/api/plugins/shiftrepair", async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  await assert.rejects(rest("/changes", { method: "POST", timeoutMs: 5 }), /Refresh before retrying a change/);
});

test("preview adapter refuses traversal and off-origin routes before making a request", async () => {
  let calls = 0;
  const rest = createFetchRest("/api/plugins/shiftrepair", async () => { calls++; return new Response("{}"); });
  for (const path of ["https://other.example/board", "//other.example/board", "/../admin"]) await assert.rejects(rest(path), /Invalid plugin route/);
  assert.equal(calls, 0);
});
