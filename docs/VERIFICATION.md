# Verification record

Date: 6 November 2026. This record distinguishes executed checks from remaining
release work. Test fixtures contain fictional staff data.

## Executed checks

| Check | Result | Scope |
| --- | --- | --- |
| Python 3.12.14 application suite | 61 tests and 20 validation subtests passed | Models, checker, optimization, storage, service, CSV, REST and tool adapters |
| Python 3.14.9 with Hermes's pinned dependencies | 61 tests and 20 validation subtests passed | Same complete suite on the supported Hermes runtime |
| Ruff | Passed | Python source and tests |
| Mypy | Passed, 11 application modules | Explicit package bases for the unified plugin layout |
| TypeScript and frontend build | Passed | Native ESM bundle and standalone preview bundle |
| Frontend logic and transport tests | 13 passed | Status honesty, candidate freshness, API errors, timeouts, route confinement and schedule helpers |
| React interaction tests with jsdom and real FastAPI | 4 passed | Complete repair flow, explicit relief, stale proposal rejection and old connection response isolation |
| Real Hermes PluginManager | Passed | Ten actual tool registrations on Hermes v0.22.7 |
| Actual gateway router discovery and mount | Passed | Agent tool writes appear through REST, and REST applies appear through tools |
| `hermes plugins doctor --ci` | Passed | Clean release snapshot, manifest, imports, native bundle and tool discovery |
| `hermes plugins validate --install-deps --json` | Passed, 16 checks, zero warnings | Clean source snapshot; real isolated dependency installation, safe security scan, exact capabilities, native SDK surface and no core override |

The complete catalog admission result, including isolated dependency
installation, is recorded in `submission/verification/`. It checks a clean
working-tree snapshot, not a published release commit. Run it again against
the exact public commit selected for the catalog PR.

Hermes target: `v0.22.7`, commit
`b200f5bc60e31588ba2cb60e288029c4a54ba5fa`. The isolated host test uses Python
3.14.9, OR-Tools 9.15.6755, Pydantic 2.14.1 and FastAPI 0.133.1. The local Python
3.12 environment uses compatible versions within `pyproject.toml` bounds.

The test runs report one dependency deprecation warning from Starlette's
TestClient about its `httpx` transport. It does not fail a test. There is no
claim that CI has run on a remote repository.

## What the experiments establish

The eight-person example starts with 28 valid assignments. With Asha absent
on Monday, CP-SAT returns OPTIMAL with two changed positions and a matching
objective bound of two. The independent checker reports no violations.

A separate six-position case enumerates all 729 possible person-to-position
assignments. The best feasible enumerated cost and the solver's proven cost
both equal two. This is a small exact oracle, not a proof of correctness for
every possible input.

Making both Asha and Chen unavailable on Monday proves infeasibility. The
explanation identifies two lead positions and only one qualified, available
person with positive weekly capacity. An explicitly entered relief person
with the lead role and Monday availability yields a proven one-position repair.
The solver does not change the original constraints or create that worker.

A combined-role conflict exercises a separate feasibility model with named
assumptions. The returned set is sufficient to establish a contradiction; no
claim of a minimal conflict set is made. Zero search budget produces UNKNOWN
and no applicable assignment.

Storage tests exercise simultaneous writers, changes during a solve, candidate
replacement, stale apply requests, atomic failed edits and repeated undo.
CSV tests cover exact project round trips, formula-looking names, duplicate
records, malformed or oversized data, excessive JSON nesting and invalid
Unicode. Malformed imports return structured errors without changing the board.

## Interaction evidence

The React integration suite launches the real preview API with an isolated
temporary database. It clicks the actual component controls to change
availability, solve, apply, export a 29-line schedule CSV, and undo. Other tests
verify infeasibility, no Apply control for unresolved results, manually selected
relief qualifications and days, rejection of old proposals, and isolation from
late replies from another connection.

These tests exercise DOM events and application state through jsdom. They do
not inspect rendered pixels. The native bundle's external imports are
`@hermes/plugin-sdk`, `react`, and `react/jsx-runtime`. Native TypeScript checks
use a narrow declaration of the documented stable SDK, not the running
Electron renderer.

## Remaining release gates

The connected browser was unavailable in this environment, and the cloud
browser could not reach the workspace's localhost preview. Therefore no
browser screenshot, layout approval or real Electron Desktop walkthrough is
claimed. The following checks still require the actual Desktop host:

- Install and enable both Python and Desktop components in a clean profile.
- Open the native page and verify dialogs, responsive layout, light and dark themes.
- Confirm a chat edit updates the displayed board and a board edit appears in chat.
- Switch active profiles and gateway connections while a request is in flight.
- Export through the native folder picker and inspect the saved CSV.
- Capture real screenshots and record the working demo in under 90 seconds.

Publication also needs the user's public repository, a full release commit pin,
a catalog PR, the X demonstration and the competition form. The source package
and submission drafts contain no invented links or success claims.
