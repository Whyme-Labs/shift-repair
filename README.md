# ShiftRepair for Hermes

Repair a weekly staff or volunteer schedule after an absence. Keep the accepted
rules, minimize changed assignments, review the exact difference, and apply the
repair when it is ready.

This repository contains a working MVP: a constraint solver,
independent result checker, durable revision store, ten Hermes agent tools,
native Desktop entry point, and a standalone preview using the same backend.
It is not yet a submitted marketplace entry. See [verification](docs/VERIFICATION.md)
for completed checks and the remaining native Desktop smoke test.

Development is tracked in [the release progress issue](https://github.com/Whyme-Labs/shift-repair/issues/1).
The installable MVP includes normal package installation, a checked native SDK
contract and independent exact-oracle tests for the repair workflow. See
[contribution instructions](CONTRIBUTING.md) for the local development checks.

## Try the working preview

Use Python 3.12 through 3.14 and `uv`. From this repository:

```bash
uv venv
uv pip install --python .venv/bin/python -e '.[preview]'
.venv/bin/python -m shiftrepair.cli --data-dir .runtime/preview serve
```

Open `http://127.0.0.1:8787`. The server listens only on localhost. The compiled
preview is included, so Node is needed only to change or rebuild the interface.
On Windows, use the equivalent executable paths under `.venv/Scripts`.
For a normal wheel installation and a reproducible release check, follow
[the installation guide](docs/INSTALL.md).

1. Open the example week.
2. Open **Availability & limits** and mark Asha unavailable on Monday.
3. Select **Find a repair**. The example requires two changed positions.
4. Review the assignment diff, then select **Apply 2 changes**.
5. Export the accepted schedule as CSV. Use Undo to restore earlier content.

For the conflict example, reset the example and mark both Asha and Chen
unavailable on Monday. Two lead positions now have one eligible worker.
Add a new person with the lead role, Monday availability and a weekly limit
of one. Solve again. This explicit relief worker allows a one-position repair.

All example people are fictional. No language-model API key is required for the
standalone preview or optimization. A connected Hermes agent uses its normal
model configuration to call the tools.

## What the plugin does

The agent and Desktop page share one profile-scoped schedule. Both can import
a project, change availability, set weekly capacities, lock assignments and add
explicitly supplied people. A solve creates a proposal without replacing the
current schedule. Apply requires the current revision and stored candidate ID.
An independent checker runs again before the database accepts the assignment.

Every content change creates a durable revision in SQLite. Concurrent edits
use optimistic revision checks, so an old request cannot overwrite new work.
Repeated Undo walks back through earlier content while preserving the audit
history. A reset also creates an undoable revision.

The native entry point uses the public Hermes SDK, documented REST namespace,
profile state and event stream. The standalone preview shares the React
components and service. Its compiled output lives outside `desktop/` so Hermes
does not mistake the browser preview runtime for native plugin code.

### Scope of the scheduling model

- One location and a seven-day window.
- At most 32 people and 126 required positions.
- Explicit day availability and role qualifications.
- At most one assignment per person per day.
- Explicit weekly assignment limits and locked assignments.
- Every position must have exactly one assigned person.

The objective is the number of positions whose assigned person changes from
the current baseline. It does not optimize payroll, hours, fairness or legal
rest requirements. Shift labels are descriptive, not time intervals. Do not
use this milestone to infer compliance with employment rules.

`OPTIMAL` means the solver proved the minimum under this model and its bound
matches the change count. `FEASIBLE` means a valid repair was found without a
proof of minimality. `INFEASIBLE` means the accepted rules cannot all hold.
`UNKNOWN` means no conclusion was established within the budget. The interface
keeps those states distinct and cannot apply an unresolved result.

## Hermes integration

The compatibility target is Hermes `v0.22.7` and its supported Python 3.14
runtime. The manifest, root Python entry point, `dashboard/plugin_api.py` and
compiled `desktop/plugin.js` are included. Backend dependencies install from
`pyproject.toml`. Native Desktop enablement and Python plugin enablement are
separate in Hermes.

Use the exact install and verification procedure in
[the submission checklist](docs/SUBMISSION.md). Do not copy the standalone
preview into Hermes's native Desktop plugin directory.

The ten tools use a common `shiftrepair_` prefix: `get_board`, `load_demo`,
`import_roster`, `change`, `solve`, `apply`, `discard`, `undo`, `export`, and
`import_csv`. Tool arguments are strict and reject unknown fields. Demo reset
requires explicit confirmation in the tool arguments. A candidate ID protects
against applying a different proposal than the one reviewed.

## Development

```bash
uv pip install --python .venv/bin/python -e '.[dev]'
.venv/bin/python -m pytest -q
.venv/bin/ruff check .
.venv/bin/mypy shiftrepair
npm --prefix desktop ci
npm --prefix desktop run build
npm --prefix desktop test
npm --prefix desktop run test:ui
npm --prefix desktop run test:native
```

The project includes a complete small fixture in `examples/cedar-demo.json`,
a portable project CSV, and a readable schedule CSV. [CSV format](docs/CSV.md)
explains the difference. [Architecture](docs/ARCHITECTURE.md) describes the
state transitions and trust boundaries. [Verification](docs/VERIFICATION.md)
records the actual checks, including 40 generated small schedules checked
against exhaustive enumeration of 36,760 assignments.

Before a catalog PR, validate a clean checkout containing the compiled native
bundle and excluding virtual environments, `node_modules`, caches and local
databases:

```bash
hermes plugins doctor /absolute/path/to/shiftrepair --ci
hermes plugins validate /absolute/path/to/shiftrepair --install-deps
```

## Data and installation disclosure

Scheduling operations run locally in the Hermes Python process. The plugin
stores people, qualifications, availability, assignments, pins and revision
history in the active profile's plugin data directory. The standalone preview
uses its chosen `--data-dir`. CSV exports contain that project data. The
database is not encrypted by this plugin.

The plugin does not send schedules to a third-party service or make independent
model calls. Its native REST requests use the user's configured Hermes server,
which can be remote. Roster information included in chat or tool results may
be sent to the language model selected in Hermes.

Installation downloads declared dependencies, including OR-Tools, from the
configured package index. The repository does not vendor native binaries.
Scheduling operations do not read credentials, send messages, run shell
commands, collect telemetry or update plugin code. The preview starts a local
HTTP server only when explicitly launched. Native CSV export uses the SDK's
user-selected folder permission.

## Submission preparation

The `submission/` directory contains a catalog template, PR draft, 85-second
recording plan, social post draft and form checklist. Release-specific fields
remain visibly incomplete until the public repository, pinned commit and real
demo exist. Nothing has been posted or submitted.

License: MIT. OR-Tools and React retain their own licenses. Existing scheduling
optimization is established prior work; this project's contribution is the
reviewable, persistent Hermes workflow.
