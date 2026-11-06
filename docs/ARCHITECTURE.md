# Architecture and invariants

## One application boundary

Agent tools in the root `__init__.py` and HTTP handlers in `shiftrepair/api.py`
both call `RosterService`. The native adapter resolves
`plugin_data_dir("shiftrepair")` on every request. It does not cache a profile
path globally. The preview supplies an explicit, separate directory.

The service owns accepted input changes, solving, review, application and
export. The UI sends typed facts and candidate identifiers, never an arbitrary
replacement assignment on the Apply route. Tool and REST input models reject
unknown fields, booleans in integer fields and ambiguous dates.

## Repair objective

For each position `s` and person `p`, a binary decision says whether `p` fills
`s`. The constraints enforce exactly one person per position, availability,
qualification, daily and weekly capacity, and pins. The objective minimizes:

```text
sum(assignment[s] != baseline[s] for each position s)
```

OR-Tools CP-SAT solves this finite integer model. One worker and a fixed seed
make repeated demo behavior stable on the tested runtime. They do not promise
identical tie-breaking across every future solver release.

The result records status, change list, best objective bound and elapsed time.
The default budget is five seconds, including model construction, search and
conflict diagnosis after a lazy OR-Tools import. First-use import overhead is
outside that reported time. Only an exact matching bound supports an OPTIMAL
claim. A separate plain-Python checker verifies every applicable assignment.

Infeasibility explanations use factual shortage checks and, when needed, a
separate feasibility model with named assumptions. A sufficient conflicting
set proves that those constraints cannot all hold. It does not claim to be
the smallest explanation.

## Revisions and candidates

SQLite contains one active board, immutable content revisions and at most one
current solver candidate. Each content mutation starts `BEGIN IMMEDIATE`,
checks `expected_revision`, and commits the new revision with the old candidate
cleared. JSON snapshots avoid shared mutable objects between callers.

The solver reads a snapshot and computes outside the write transaction. Saving
the candidate checks the revision again. A concurrent edit therefore prevents
an old solve from attaching a candidate to new facts. Multiple solves for one
revision get distinct candidate IDs; only the last stored candidate can apply.

Apply loads that candidate inside the same write transaction as the revision
check, verifies it independently against the current rules, and creates a new
baseline revision. A repeated Apply request fails its old revision check.

Undo restores prior content as a new revision. Each revision also has a parent
pointer, so repeated Undo moves backward through content history rather than
toggling the last two snapshots. The response includes the newest 20 audit
entries, while SQLite retains the full history.

Events fire after commit and carry the revision number. An event transport
failure is logged without reversing the committed mutation or falsely telling
the caller it failed. The Desktop UI also refreshes periodically.

## Interface and runtime boundaries

`desktop/src/App.tsx` is shared by the native and preview entries.
`desktop/plugin.js` imports only the supported SDK and React. Its adapter uses
the profile and gateway activation state to discard old connection results,
and uses documented file permissions for exports.

`preview/` contains the standalone React runtime and browser download adapter.
It is outside Hermes's native plugin scanning directory. `shiftrepair/cli.py`
serves these assets and the same REST router on localhost only.

No model-generated code enters the solver. New people and relaxed constraints
must be explicit user actions. A solver never invents a relief worker or changes
availability to manufacture feasibility. The accepted baseline may temporarily
break a changed rule, which is how a real absence becomes a repair problem.

## Current limits

One active week per profile is intentional for this milestone. Input limits
bound solver size. Export requires a valid accepted baseline. The full project
CSV restores the people and rules; the schedule CSV is a human-facing output.
There is no remote roster synchronization, notification delivery, payroll,
fairness objective, hour-level availability or legal compliance engine.
