import assert from "node:assert/strict";
import test from "node:test";
import { assignmentCounts, canApply, personId, resultPresentation, scheduleRows, weekDays } from "../.test-build/model.mjs";

const result = (overrides = {}) => ({ status: "OPTIMAL", assignment: { a: "chen" }, changes: [{ slot_id: "a", from_person_id: "asha", to_person_id: "chen" }], changed_assignments: 1, optimal: true, objective_bound: 1, elapsed_seconds: .03, violations: [], conflicts: [], ...overrides });
const candidate = (overrides = {}) => ({ id: "candidate-1", base_revision: 4, result: result(), created_at: "2026-11-06T12:00:00Z", ...overrides });

test("unproven feasible solutions never claim minimum changes", () => {
  const feasible = resultPresentation(candidate({ result: result({ status: "FEASIBLE", optimal: false, objective_bound: 0 }) }));
  assert.equal(feasible.proven, false);
  assert.match(feasible.description, /Fewer changes may still be possible/);
  const inconsistent = resultPresentation(candidate({ result: result({ status: "FEASIBLE", optimal: true }) }));
  assert.equal(inconsistent.proven, false);
  assert.equal(resultPresentation(candidate()).proven, true);
});

test("unknown solver status is distinct from a proof of infeasibility", () => {
  const unknown = resultPresentation(candidate({ result: result({ status: "UNKNOWN", assignment: null, optimal: false, changes: [], changed_assignments: null }) }));
  assert.match(unknown.title, /time limit/);
  assert.match(unknown.description, /does not prove/);
  const infeasible = resultPresentation(candidate({ result: result({ status: "INFEASIBLE", assignment: null, optimal: false, changes: [], changed_assignments: null }) }));
  assert.match(infeasible.description, /proved.*cannot all be satisfied/);
  assert.notEqual(infeasible.title, unknown.title);
});

test("apply is closed for stale, invalid, missing and unverified candidates", () => {
  assert.equal(canApply({ revision: 4, candidate: candidate() }), true);
  assert.equal(canApply({ revision: 5, candidate: candidate() }), false);
  assert.equal(canApply({ revision: 4, candidate: null }), false);
  assert.equal(canApply({ revision: 4, candidate: candidate({ result: result({ assignment: null }) }) }), false);
  assert.equal(canApply({ revision: 4, candidate: candidate({ result: result({ violations: [{ code: "unavailable" }] }) }) }), false);
  assert.equal(canApply({ revision: 4, candidate: candidate({ result: result({ status: "UNKNOWN" }) }) }), false);
});

test("weekly grid groups repeated positions without losing any slot", () => {
  const slots = [
    { id: "one", date: "2026-11-09", shift: "AM", role: "floor" },
    { id: "two", date: "2026-11-09", shift: "AM", role: "floor" },
    { id: "three", date: "2026-11-10", shift: "AM", role: "floor" },
    { id: "four", date: "2026-11-09", shift: "PM", role: "lead" },
  ];
  const rows = scheduleRows(slots);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.role === "floor").byDate["2026-11-09"].length, 2);
  assert.deepEqual(rows.flatMap((row) => Object.values(row.byDate).flat()).map((slot) => slot.id).sort(), ["four", "one", "three", "two"]);
});

test("calendar dates cross month/year boundaries without locale offset drift", () => {
  assert.deepEqual(weekDays("2026-12-28"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.equal(weekDays("2026-03-08")[6], "2026-03-14");
});

test("new people receive distinct safe identifiers while preserving their entered display name outside the identifier", () => {
  assert.equal(personId("Asha", ["asha", "asha-2"]), "asha-3");
  assert.equal(personId("Zoë O'Neil", []), "zoe-o-neil");
  assert.equal(personId("李", ["relief"]), "relief-2");
});

test("assignment counts include unassigned staff and honor the explicit candidate map", () => {
  const roster = { people: [{ id: "asha" }, { id: "chen" }, { id: "ben" }], baseline: { one: "asha", two: "chen" } };
  assert.deepEqual(assignmentCounts(roster), { asha: 1, chen: 1, ben: 0 });
  assert.deepEqual(assignmentCounts(roster, { one: "ben", two: "chen" }), { asha: 0, chen: 1, ben: 1 });
});
