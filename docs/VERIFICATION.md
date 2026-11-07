# Verification record

Updated: 8 November 2026. Test fixtures contain fictional staff data. The
installable MVP checks below date from 6 November; the later Mac sections record
the preview and real Electron walkthrough. Publication remains pending. No
remote CI run is claimed.

## Checked source

The installable MVP was checked as local commit
`c4d1e434bd8dc4bb0aaf1973d17677d578c8b754`. GitHub implementation commit
[`887b557dfba1f4d2f6d355d4f2377be68ab2af2d`](https://github.com/Whyme-Labs/shift-repair/commit/887b557dfba1f4d2f6d355d4f2377be68ab2af2d)
contains the exact same Git tree:

```text
7d6e6b0108486c3b355c04fba19343801d1c3ffe
```

The complete 85-file source manifest hashes to
`05a616a695651272de7670765081064008b0affdcc4f49095152c5b744885709`.
The executable, build and test input manifest hashes to
`ccf4fabb91d6c4469ba1b31d3823238f14be679c55a0c82a88f7342ac18197c5`.
The following evidence commit updates documentation and records these results.
It does not change those implementation inputs.

Current reports are under
[`submission/verification/installable/`](../submission/verification/installable/).
The provenance file maps the local and GitHub source identities. The source
manifest records each checked file, and the Hermes report records commands,
exit codes, runtime versions and the isolated profile used for admission.

## Executed checks

| Check | Result | Scope |
| --- | --- | --- |
| Python 3.12.14 application suite | 73 tests and 20 validation subtests passed | Models, checker, solver, storage, service, CSV, REST, tools and release packaging |
| Python 3.14.9 with Hermes dependency pins | 73 tests and 20 validation subtests passed | Complete suite against the clean exported source |
| Ruff | Passed | Python source and tests |
| Mypy | Passed, 11 application modules | Explicit package bases for the unified plugin layout |
| TypeScript and frontend build | Passed | Native ESM and standalone preview bundles |
| Frontend logic and transport tests | 14 passed | Status honesty, candidate freshness, structured errors, timeouts and schedule helpers |
| React interaction tests | 13 passed | Real backend repair flows plus controlled asynchronous failures and races |
| Native adapter tests | 8 passed | Actual compiled plugin through a contract-checked SDK host double |
| Upstream SDK contract | 36 anchors verified | Public signatures and generated declaration checked against stable Hermes source |
| Clean release rebuild | Passed | All three generated assets match the committed bytes |
| Source distribution and wheel | Passed | Wheel built from sdist, exact preview assets and both license files included |
| Fresh installed-package HTTP smoke | Passed | Normal wheel install outside checkout, real repair/apply/export and separate-process persistence |
| `hermes plugins doctor --ci` | Passed | Actual loader, manifest, import and registration of ten tools |
| `hermes plugins validate --install-deps --json` | Passed, 16 checks, zero warnings | Actual isolated dependency preparation, capability probe, security and Desktop SDK surface |

Hermes target: `v0.22.7`, commit
`b200f5bc60e31588ba2cb60e288029c4a54ba5fa`. Supported-runtime tests used Python
3.14.9, OR-Tools 9.15.6755, Pydantic 2.14.1 and FastAPI 0.133.1. Catalog admission
reported `safe` and `host_ready: true`. These are validator results, not a claim
that Electron rendered the page.

The fresh standalone wheel resolved Python 3.12.14, OR-Tools 9.15.6755,
Pydantic 2.14.3, FastAPI 0.162.0 and uvicorn 0.54.0. Uvicorn was absent from the
base installation and present only after installing the preview extra. Python
version ranges remain bounded rather than fully locked; reports record the
versions actually tested.

Both Python suite runs reported one Starlette TestClient deprecation warning
about its `httpx` transport. No test failed. The catalog's zero-warning result
is a separate result from that dependency warning.

## Solver experiments

The eight-person example starts with 28 valid assignments. Making Asha absent
on Monday returns OPTIMAL with two changed positions and a matching objective
bound of two. The independent checker reports no violations. The installed
HTTP smoke confirms that solving preserves the baseline until Apply.

The generated oracle uses seed `20261106` and 40 bounded small schedules.
It enumerates 36,760 complete assignment vectors, with 141 feasible vectors
across 11 feasible schedules. The other 29 schedules are infeasible. Every
vector's independent eligibility result is compared with the production
checker, and every schedule's exact optimum or infeasibility is compared with
CP-SAT. There were zero disagreements. Feasible minima span zero through four
changed assignments.

The oracle deliberately avoids production eligibility and constraint helpers.
It includes planted feasible cases, explicit contradictions and generated
qualifications, availability, capacities and pins. This bounded experiment is
not a proof for all possible inputs. The earlier six-position oracle also
checks all 729 assignments and establishes a two-change optimum.

Making both Asha and Chen unavailable on Monday proves infeasibility. Two lead
positions have only one eligible person. An explicitly entered relief worker
with the lead role and Monday availability allows a proven one-position
repair. The solver never invents that worker or changes the constraints.

A combined-role conflict uses a separate feasibility model with named
assumptions. Its explanation is sufficient to establish a contradiction;
it need not be a minimum conflict set. Zero search budget returns UNKNOWN
and no applicable assignment.

## State and interface reliability

Apply checks the stored result schema, independently validates the assignment,
and recomputes its actual difference from the current baseline. A proposal
with an omitted change or incorrect previous assignee is rejected atomically.
Revision and candidate identity checks still protect concurrent changes.

Storage tests cover simultaneous writers, edits during a solve, candidate
replacement racing Apply, failed edits, repeated Undo and edits after Undo.
Undo availability now follows the stored revision parent even when the visible
audit history is truncated or the content chain is exhausted. CSV tests cover
round trips and malformed, oversized or ambiguous inputs without mutation.

The React suite uses jsdom and a real isolated FastAPI backend for repair,
Apply, CSV export, Undo, infeasibility and explicit relief. Controlled delays
exercise coalesced polling, failed-write recovery, old-scope replies and errors,
duplicate export clicks, and late file reads. A failed initial load offers
retry rather than treating an unknown board as empty.

Native tests import the actual compiled `desktop/plugin.js`. The SDK host,
folder picker, file operations and dialogs are test doubles checked against
the upstream-derived type projection. Tests cover registration, REST arguments,
opaque folder grants, exclusive writes, cancellation, profile and activation
changes, and event/timer cleanup. They do not inspect pixels or run Electron.

The native bundle's external imports are limited to `@hermes/plugin-sdk`,
`react` and `react/jsx-runtime`. The clean release check rebuilds both targets
and refuses stale generated output. The installed smoke fetches real HTML and
JavaScript over HTTP, but does not execute that JavaScript in a browser.

## Historical baseline evidence

The original MVP reports remain in the parent verification directory. They
record 61 Python tests, 20 validation subtests, the real Hermes PluginManager
and gateway router mount, and bidirectional tool/REST state sharing. Their
`checked-source.json` belongs to that earlier snapshot. Do not interpret its
historical working-tree comparisons as comparisons with today's code.

Use the `installable/` reports for this milestone. Re-run admission and the
release check on the exact final public commit chosen for the catalog entry.

## Chrome walkthrough on 8 November

The standalone preview now has an observed walkthrough in Chrome on macOS.
The real backend loaded the fictional week, saved Asha's Monday absence,
proved a two-assignment repair, kept the baseline unchanged until Apply, and
exported a CSV containing all 28 assignments. Removing both Asha and Chen's
Monday availability produced the two-lead shortage. Explicitly adding one
qualified Monday relief worker allowed a proven one-assignment repair.
Restarting the backend preserved the accepted board, and repeated Undo
restored the earlier shortage state.

The first fresh native-library import was slow enough to exceed the preview's
request timeout. Refresh recovered the completed proposal. A separate import
probe and a native process sample located the wait in the OR-Tools library
loader; a subsequent import took 0.331 seconds. No security setting or library
signature was changed.

A fresh installed-package check reproduced that startup delay. The release
check now imports the solver under its bounded startup check before the HTTP
workflow and records the duration. The successful worktree check measured
144.253 seconds for that import, then passed the two-change repair, baseline
preservation, Apply validation, both CSV exports and cross-process persistence.
This check used Python 3.12.11 and OR-Tools 9.15.6755. It is development evidence,
not validation of the final catalog commit.

The walkthrough also corrected singular/plural wording in the shortage
explanation and removed Apply instructions from the shared result footer.
The final footer reports the checked revision and unchanged current schedule.

The [Mac preview evidence](../submission/verification/macos-preview-20261108/report.json)
records source fingerprints, local check counts and the observed workflow. Its
directory includes the rendered preview conflict, accepted synthetic schedule
CSV and check logs with absolute workspace paths redacted.

## Native Mac walkthrough on 8 November

The real Hermes v0.22.7 Electron application was built from the upstream tag
and run on macOS 26.2, Apple Silicon, in a dedicated development home. Hermes PM
installed the plugin dependencies into its Python 3.14.9 environment. Both the
Python plugin and the native Desktop component were enabled through the normal
activation flow. A foreground local gateway served the app; no system service
was installed and no OS security setting was weakened.

The loaded source was exact commit
`3c27bb35693c9fca11fd769a2791643f747d0648`, with source-manifest digest
`008421eca1a79beeb83eb3264f412b43bed61bcc608bef81deef9b1ee5e5d198`.
The documentation and media evidence commit does not change that runtime code.
The real doctor registered all ten tools. Catalog validation at the canonical
installed path, including successful dependency resolution and installation,
passed all 16 checks with zero warnings, security `safe` and `host_ready: true`.
An earlier attempt at a second path collided with the installed package name;
only the successful canonical-path run is counted.

| Observed native behavior | Result |
| --- | --- |
| Asha unavailable Monday | OPTIMAL, two changes; current assignments preserved until Apply |
| Asha and Chen unavailable Monday | INFEASIBLE, two lead positions and only Ben available; no Apply button |
| Explicit Iris (demo), Lead, Monday, limit one | OPTIMAL, one change; native Apply accepted the checked result |
| Actual registered tool and native board | Tool read native edits, added cover and solved; board displayed the proposal; tool read the native Apply result |
| Stale tool edit | `stale_revision`, with revision and availability unchanged |
| Native folder picker | Cancel recovered controls; selecting the task export folder saved a real 28-row CSV |
| Project CSV import | Invalid input displayed an error without mutation; full project export reimported with nine people and the accepted assignments |
| Profiles | Separate profile had its own eight-person revision 1; returning restored the nine-person default board |
| Dialogs, keyboard and appearance | Reset cancellation and confirmation, Add cover, import, keyboard tab movement, light and dark themes observed |
| Narrow window | At 1100 × 820, repair actions fit and the schedule uses horizontal scrolling |

The [native evidence](../submission/verification/macos-native-20261108/report.json)
includes the doctor, admission result and dependency log, source manifest,
registered-tool reports, CSV receipt and recording provenance. The
[60-second video](../submission/media/shiftrepair-native-demo.mp4) shows actual
native UI actions and solver results. Setup and the wait in the native save
dialog were removed; workflow states were not replaced. Captions sit below the
full application image. The final exported schedule contains 28 assignments,
three pins and Iris in Monday's AM Lead position.

No language model was configured for this walkthrough. The tool checks used
the actual Hermes registry, not a model or a mock host. Natural-language chat,
remote gateway switching, and switching scopes while requests are in flight
remain unobserved in the real host. Controlled asynchronous scope races are
covered by the React and SDK-adapter suites. Windows and Hermes versions newer
than v0.22.7 have not been tested. These limits also appear in the submission
draft; the native demo does not imply chat was tested.

## Remaining release gates

[Issue #5](https://github.com/Whyme-Labs/shift-repair/issues/5) retains the
model-backed and live connection lifecycle checks described above.

[Issue #6](https://github.com/Whyme-Labs/shift-repair/issues/6) tracks the public
repository, selected release commit, catalog PR, X demonstration and competition
form. The repository is currently private. Submission drafts retain explicit
placeholders for artifacts that do not yet exist. Final admission must be run
against the selected release commit before opening the catalog PR.
