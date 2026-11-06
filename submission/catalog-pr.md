# Draft only. Complete the evidence before opening the PR.

Suggested title: `Add ShiftRepair to the plugin catalog`

## What this plugin does

A staff absence can make an otherwise valid schedule unusable. ShiftRepair lets
a Hermes user record the change, propose a repair with as few changed
assignments as the solver can prove, inspect the diff, and explicitly apply it.

The plugin adds ten agent tools and a native Desktop board backed by the same
profile-scoped SQLite state. CP-SAT handles the stated constraints. A separate
Python checker validates every proposed assignment before it can be applied.
Revision checks protect against a chat edit overwriting a human board edit.
Infeasible inputs return a sufficient conflict explanation instead of a
fabricated schedule. Unknown and unproven feasible statuses remain visible.

The initial scope is one location, seven days, at most 32 people and 126 slots,
with at most one assignment per person per day. It models explicit role
qualification, availability, weekly assignment capacity and pinned assignments.
It does not claim labor-law compliance, payroll support or rest-period modeling.

## Release and evidence

- Repository: https://github.com/Whyme-Labs/shift-repair, currently private and requiring public access before submission.
- Pinned plugin commit: `__REQUIRED_40_CHARACTER_COMMIT__`
- Version: `0.1.0`
- Minimum Hermes: `>=0.22.7`
- Runtime test log: `__REQUIRED_RELEASE_VERIFICATION_LINK__`
- Native Desktop screenshots: `__REQUIRED_SCREENSHOT_LINKS__`
- Working demo under 90 seconds: `__REQUIRED_VIDEO_LINK__`
- Repository contributor: `wms2537`, with release ownership to confirm before submission.

Replace this paragraph with the actual release validation results, including
Python version, Hermes commit, Python test count, the doctor result and the
catalog validator result. Do not copy working-tree results onto a different
release commit without rerunning the checks.

## Hermes surfaces

- `ctx.register_tool` registers the tools listed in the catalog capabilities.
- `plugins.plugin_storage.plugin_data_dir` resolves profile-scoped durable data per call.
- `hermes_cli.plugin_events.broadcast_plugin_event` emits revision-only invalidation events.
- The native Desktop SDK owns the route and interface.
- The documented `dashboard/manifest.json` and `APIRouter` mount expose only `/api/plugins/shiftrepair` routes.
- A package declared in `pyproject.toml` supplies shared application logic to tools and REST.

No privileged capability, model override, tool override, private core import or
runtime core patch is requested.

## Disclosures

Scheduling runs locally in the Hermes backend. The plugin stores staff names,
roles, availability, assignments and revision history in its own profile data
directory. The database is not encrypted by the plugin. User-initiated CSV
exports contain staffing data.

There are no independent external model calls, third-party schedule uploads,
telemetry, stored credentials, credential-file reads, self-updater, shell
commands, arbitrary filesystem imports or background daemon in runtime plugin
operations. Hermes's selected model can receive roster data supplied through
chat/tool context. A remote Hermes connection stores and processes the roster
on that user-configured backend.

Package installation obtains bounded Python dependencies from the configured
package index, including the OR-Tools native solver wheel. No native binary is
vendored into the plugin repository. The JavaScript bundle has included source
and a reproducible build command. The optional developer preview starts a local
HTTP server only when launched explicitly.
