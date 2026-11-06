# Working on ShiftRepair

The progress index is [issue #1](https://github.com/Whyme-Labs/shift-repair/issues/1).
Link each substantive change to its issue, describe the observed problem and
record the checks that demonstrate the resulting behavior. Keep incomplete
release gates open even when related automated tests pass.

## Development setup

Use Python 3.12 through 3.14. Native Hermes compatibility is verified against
the supported Python 3.14 runtime and stable Hermes dependency pins.

```bash
uv venv
uv pip install --python .venv/bin/python -e '.[dev]'
npm --prefix desktop ci
```

The standalone interface and native plugin share React components. The agent
tools and REST routes share `RosterService`. Change the shared boundary when
behavior belongs in both interfaces.

## Checks

Run the relevant tests while implementing a change. Before a completed milestone:

```bash
.venv/bin/python -m pytest -q
.venv/bin/ruff check .
.venv/bin/mypy shiftrepair
npm --prefix desktop run build
npm --prefix desktop test
npm --prefix desktop run test:ui
npm --prefix desktop run test:native
```

The frontend integration tests start a temporary real backend. They verify
component behavior through jsdom and do not claim browser pixel inspection.
Read `desktop/README.md` for native SDK checks and `docs/INSTALL.md` for the
installed-package and release procedure.

With the supported Hermes source checkout available, verify the native type
projection against its public source signatures:

```bash
npm --prefix desktop run check:sdk -- --source=/path/to/hermes-agent
```

The exact oracle test can print its numerical evidence separately:

```bash
.venv/bin/python -m pytest tests/test_solver_oracle.py -q -s
```

The fixed generated sample is bounded. Add a new case only to check a concrete
interaction or an observed regression. Keep the independent oracle separate
from production eligibility and constraint helpers.

## Source and build output

Commit native `desktop/plugin.js` and the root `preview/` output with the source
that produced them. Hermes loads the native bundle without running npm.
Never include `node_modules`, virtual environments, caches, local databases,
or obsolete `desktop/preview/` output in the release tree. The root preview
contains the standalone browser runtime and is outside the native scan path.

Preserve third-party notices when distributing the bundled preview. Pin the
actual source commit in any catalog entry and re-run the real Hermes validator
against that clean tree. A successful earlier working-tree check is historical
evidence, not a substitute for checking the submitted commit.

## Product guarantees

- Availability and qualifications are explicit inputs.
- A solve produces a proposal and preserves the accepted baseline.
- Apply requires the current revision and the stored candidate that was reviewed.
- Applicable assignments pass the independent checker and match their displayed diff.
- OPTIMAL, FEASIBLE, INFEASIBLE and UNKNOWN retain their distinct meanings.
- Repeated Undo follows content ancestry while the audit history remains durable.
- Native tools and REST requests resolve profile-local storage per invocation.

The initial scheduling scope remains one location, seven days and at most one
assignment per person per day. Payroll, legal rules, fairness objectives and
external notifications need a separate product decision.

## Release evidence

Record the command, runtime, source revision or fingerprint, exit status and
meaningful result. Keep host rendering, folder-picker behavior and screenshots
separate from unit, component and ASGI tests. The competition demo must show
the real plugin working. Submission drafts must retain placeholders until the
corresponding public artifact exists.
