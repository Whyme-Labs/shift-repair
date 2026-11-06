# Implementation contract

Milestone 1: real local solver, native Hermes adapter, shared durable revisions, runnable standalone preview. No production notifications, third-party accounts or autonomous publishing.

## Domain

Use Pydantic v2, extra fields forbidden. Models in shiftrepair/models.py.

Person: id, name, roles list[str], available_days list[ISO date], max_assignments integer.
Slot: id, date ISO date, shift string, role string.
Roster: name, week_start ISO date, people list[Person], slots list[Slot], baseline dict[slot_id,person_id], pins dict[slot_id,person_id]. One location, seven days, at most one assignment per person per day, maximum32 people/126 slots. All ids and references validated; baseline covers every slot, but may violate a newly changed availability rule. Never silently infer availability.

SolveResult model: status OPTIMAL|FEASIBLE|INFEASIBLE|UNKNOWN|MODEL_INVALID; assignment dict[str,str] or null; changes list[Change]; changed_assignments integer or null; optimal boolean; objective_bound float or null; elapsed_seconds float; violations list[Violation]; conflicts list[Conflict].
Change: slot_id, from_person_id, to_person_id.
Violation: code, message, slot_ids list[str], person_ids list[str].
Conflict: code, message, slot_ids list[str], person_ids list[str].

solver.solve(roster: Roster, time_limit_seconds: float=5.0) -> SolveResult. Separate checker.check(roster, assignment) -> list[Violation], no use of solver variables. Availability, qualifications, coverage, daily/weekly capacity, pins. Only claim optimal with exact bound proof. Diagnose using separate feasibility solve. Named conflicts need human-readable facts.

examples.demo_roster() -> Roster, deterministic fixture equivalent to prior8-person28-position experiment. Demo week starts2026-11-09. Person ids lower-case stable; names Asha Ben Chen Devi Eli Farah Gopal Hana.

## Shared service and HTTP contract

Root implements storage.py/service.py/api.py/cli.py. Storage SQLite with optimistic revisions. One active board is enough; each has id, revision, roster, validation list, candidate object or null, history list. Candidate: id, base_revision, result SolveResult, created_at. History entries: revision, action, created_at. View shape always {id, revision, roster, validation, candidate, history}. Empty response {board:null}.

Backend REST mounted /api/plugins/shiftrepair by Hermes. UI receives a rest adapter accepting relative route. Endpoints:
GET /board -> {board: BoardView|null}
POST /demo body{} -> {board: BoardView}, resets the active example explicitly.
POST /roster body {roster: Roster, expected_revision?:int} -> {board:BoardView}. Creates only if no board unless correct revision supplied.
POST /changes body {expected_revision:int, changes:[{type:availability,person_id,date,available:bool}|{type:pin,slot_id,person_id|null}|{type:capacity,person_id,max_assignments:int}|{type:add_person,person:Person}]} -> {board:BoardView}. Typed strict changes, candidate invalidated.
POST /solve body {expected_revision:int} -> {board:BoardView}. Solver produces candidate even for INFEASIBLE or UNKNOWN. Candidate doesn't change roster baseline.
POST /apply body {expected_revision:int,candidate_id:str} -> {board:BoardView}. Only apply stored candidate matching revision, independently validate again, new baseline/revision.
POST /undo body {expected_revision:int} -> {board:BoardView}. Restore previous content as new revision, preserving audit history.
POST /discard body {expected_revision:int,candidate_id:str} -> {board:BoardView}. Clear the matching candidate without changing the input revision.
GET /export?kind=schedule|project -> {filename,content,mime_type}; only export current baseline if independently valid. The default schedule CSV is readable output; the project CSV preserves the complete modeled week. See docs/CSV.md.
POST /import body {content:str,expected_revision?:int} -> {board:BoardView}; accepts full project CSV only.
Errors JSON {detail:{code,message}} HTTP409 stale,422 invalid/unsupported,404 absent.

UI never fabricates successful results. Plain React component shared by native plugin and local preview. Native entry imports only public SDK/React. Do not use remote code, eval or core mutation.

## Delivery surfaces

The native entry is desktop/plugin.js. The standalone compiled browser entry is preview/app.js with preview/index.html. Native and preview share desktop/src/App.tsx. Preview runtime code is kept outside Hermes's native Desktop scan directory. The service has no Hermes imports; only its native adapters resolve profile storage and emit host events.
