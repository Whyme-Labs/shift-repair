# Submission checklist

Status date: 6 November 2026. This is a working entry, not a submitted entry.

## What the competition asks for

The announcement supplied for this project requires all of the following:

1. Open a pull request adding the plugin to the Hermes plugin catalog.
2. Post a working demo on X, under 90 seconds, and tag `@NousResearch`.
3. Submit both links through [the competition form](https://form.typeform.com/to/FwJLvOln).

The announcement gives the deadline as 11 November at 5 PM EST. Interpreted in
the current year, that is **11 November 2026 at 22:00 UTC**, or **12 November
2026 at 06:00 in UTC+8**. Confirm the date and any eligibility terms in the
organizer's live announcement and form before publishing.

The announcement says the form can be submitted once the catalog PR is open.
It says maintainers start the catalog checks and review entries every few days.
It names usefulness, reliability, polish and creativity as judging criteria,
with a preference for functionality beyond a prompt or skill.

The public Typeform page and its public form API were inaccessible during this
review. Required form fields beyond the two announced links, eligibility,
team-size rules, licensing terms, and treatment of prior work remain
**unverified**. No form has been submitted and no social post has been sent.

## Why this entry uses a plugin

ShiftRepair keeps a typed, versioned schedule in profile-scoped SQLite. Its
CP-SAT solver proposes the smallest repair it can prove, a separate Python
checker verifies the result, and the native Desktop board shares that exact
state with agent tools. Applying a proposal requires the stored candidate ID
and current revision. A prompt cannot supply these guarantees or register this
native interface.

The demo should make those differences visible. Show one staff availability
change, the affected baseline, a proposed repair, the proof status and diff,
then a manual apply. Show a genuine contradiction and its conflict explanation.
The strong claim is narrow and testable: **minimum changed assignments when
the solver reports OPTIMAL, under the declared model**. Do not call a FEASIBLE
result proven minimal. Do not call an UNKNOWN result infeasible. A sufficient
conflict set is not necessarily the smallest possible conflict.

## Official catalog requirements

The [catalog submission guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission)
and [canonical catalog README](https://github.com/NousResearch/hermes-agent/blob/main/plugin-catalog/README.md)
are the admission rules. The current local verification target is Hermes
`v0.22.7`, commit `b200f5bc60e31588ba2cb60e288029c4a54ba5fa`.

| Requirement | ShiftRepair preparation | Release gate |
| --- | --- | --- |
| Public cloneable repository | Source is tracked in `Whyme-Labs/shift-repair`, currently private | Make the approved release repository publicly cloneable before submission |
| Loadable plugin | Root Python entrypoint, manifest, native Desktop bundle and REST router | Run the real loader against the exact release tree |
| Public Hermes surfaces only | `ctx.register_tool`, `plugin_data_dir`, `broadcast_plugin_event`, native Desktop SDK and documented router mount | Review validator warnings and native smoke test |
| Complete capability declarations | Ten tools declared in `plugin.yaml` | Keep catalog list and actual registration identical |
| Exact immutable pin | Catalog template deliberately has no usable SHA | Use the full 40-character plugin release commit |
| Truthful compatibility | Manifest and catalog template both require `>=0.22.7` | Test on that stable runtime before publishing |
| Dependencies compatible with Hermes | Bounded project dependencies; no vendored native wheels | Catalog validation with `--install-deps` must pass |
| Security and API checks | No core patches, credential reads, telemetry or self-updater | No failing scanner, Desktop surface or core override checks |
| Owner or major contributor submission | Original project work | The user submits from the repository owner or contributor account |
| Reviewable UI | Source and build configuration included | Capture screenshots from the release build |
| Honest disclosure | Draft PR and disclosure below | Recheck against final code |

Add exactly one catalog file, `plugin-catalog/shiftrepair.yaml`, to a PR against
`NousResearch/hermes-agent`. The plugin itself lives in its own public repository.
Set `tier: community`; official and verified tiers belong to maintainers.
Quote the version, match it to the manifest, and pin the plugin commit rather
than the Hermes commit. Optional gallery image URLs must use permitted GitHub
hosts and should include that same plugin commit for reproducibility.

## Runtime and integration verification

Hermes v0.22.7's supported runtime is Python 3.14. Its project metadata permits
older Python only for the updater bridge. The separate local preview also runs
on Python 3.12. Both need verification because a preview pass alone does not
demonstrate Hermes compatibility.

The integration uses the documented APIs in the
[plugin developer guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins)
and [Desktop plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk).
The root `pyproject.toml` packages the shared `shiftrepair` Python module, which
Hermes PM installs before activation. The dashboard backend is a directly
loaded file and uses that installed package. It never edits `sys.path` or
patches Hermes imports.

Every tool invocation and REST request resolves
`plugins.plugin_storage.plugin_data_dir("shiftrepair")` again. The path follows
the active Hermes profile. Agent tools and REST therefore read the same board
without keeping a stale profile path in global state. Events carry only the
revision number and tell the UI to reload its own active profile's board.

Desktop enablement and Python enablement are separate. The native interface
can appear in Desktop while its backend remains unavailable. Follow the
documented install and enable flow for both components. Do not edit core
markup or bypass the Python plugin allow-list to make the demo work.

### Local development install

Use a clean extracted project or release folder with `desktop/plugin.js`
already built. Do not link a folder containing `desktop/node_modules`: Desktop
copies the native `desktop/` tree. The standalone browser build belongs in the
separate root `preview/` folder. The obsolete `desktop/preview/` output is
excluded from release packaging.

Choose the actual Hermes home for the profile you will open in Desktop. The
following commands use explicit placeholders and must be edited first. The
documented default profile location is `~/.hermes`.

```bash
SHIFTREPAIR_PROFILE_HOME=/absolute/path/to/selected/hermes-profile
SHIFTREPAIR_SOURCE=/absolute/path/to/clean/shiftrepair
mkdir -p "$SHIFTREPAIR_PROFILE_HOME/plugins"
ln -s "$SHIFTREPAIR_SOURCE" "$SHIFTREPAIR_PROFILE_HOME/plugins/shiftrepair"
HERMES_HOME="$SHIFTREPAIR_PROFILE_HOME" hermes plugins enable shiftrepair
HERMES_HOME="$SHIFTREPAIR_PROFILE_HOME" hermes plugins doctor shiftrepair --ci
```

The link command intentionally fails if that destination already exists.
Enabling uses Hermes's normal dependency preparation and activation flow.
There is no `--yes-deps` flag on `hermes plugins enable` in v0.22.7.

In Desktop, select the same profile, open **Capabilities > Plugins**, choose
**Rescan**, and enable the ShiftRepair Desktop component. The linked source's
native bundle then hot reloads through Hermes's documented development flow.
The Python backend must also remain enabled. If Desktop uses a remote backend,
the agent package must be available on that backend and its Desktop half must
also be installed on the machine running Desktop.

After publication, an immutable public repository installation uses the actual
repository URL and release SHA:

```bash
hermes plugins install https://github.com/Whyme-Labs/shift-repair --ref ACTUAL_FULL_40_CHARACTER_SHA --yes-deps --enable
```

The install parser accepts Git URLs and owner/repository shorthand. A `file://`
URL can name a local Git repository with commits; it is not a way to install
an uncommitted working folder. The linked-folder development flow above works
before a public repository exists. All flags in this section were checked
against the v0.22.7 CLI parser and Desktop SDK guide.

Run these commands in an isolated Hermes checkout with a dedicated
`HERMES_HOME`, or in the user's explicitly selected development profile:

```bash
hermes plugins doctor /absolute/path/to/shiftrepair --ci
hermes plugins validate /absolute/path/to/shiftrepair --install-deps
```

The second command is the catalog admission check. A plain import test or a
mock context is useful but does not replace it. Re-run against a clean checkout
of the commit that will be pinned, with the compiled Desktop bundle present.
Read caution findings even if validation passes.

## Release evidence to collect

- [ ] All Python tests pass on the development runtime.
- [ ] Core solver and integration tests pass on Hermes's supported Python and pinned dependencies.
- [ ] The actual `hermes plugins doctor --ci` command passes.
- [ ] The actual `hermes plugins validate --install-deps` command passes.
- [ ] Install the packaged plugin through Hermes in a clean development profile.
- [ ] Enable both native Desktop and Python components.
- [ ] Verify a chat tool edit appears in the native board and a board edit appears in chat.
- [ ] Verify a stale agent revision cannot overwrite a human edit.
- [ ] Verify a candidate is independently valid before Apply becomes available.
- [ ] Verify contradictory pins return an honest infeasibility explanation.
- [ ] Verify reload preserves the board, undo history and profile isolation.
- [ ] Export a valid schedule and reimport the full project CSV.
- [ ] Record the release build working, with no mock responses or hidden manual edits.
- [ ] Add screenshots and a concise demo link to the public repository.
- [ ] Complete public repository, maintainer, exact SHA and real media fields.
- [ ] Open the catalog PR, then publish the X video and submit both actual links.

Keep output logs with the release record. Automated checks already run during
development should be described with their exact environment and result in the
project's verification report. The boxes above are release gates, so a fresh
release commit needs a fresh check even when a previous working tree passed.

Runtime smoke evidence is in `submission/verification/runtime-smoke.json`.
It records a real Hermes `PluginManager` and gateway router mount, including
tool-to-REST and REST-to-tool state sharing. It does not claim the Electron
renderer or an interactive Desktop session was tested.

### Initial MVP checks completed on 6 November

The clean working-tree snapshot passed the actual `hermes plugins doctor --ci`
command and the actual `hermes plugins validate --install-deps --json` command
on Hermes v0.22.7. Catalog validation completed dependency preparation and
passed all 16 checks with zero warnings. Its security scan returned `safe`,
the Desktop surface check passed, and the isolation audit reported the plugin
ready for the host process mode.

The project test suite also passed on the supported Python 3.14.9 runtime with
Hermes's pinned Pydantic 2.14.1 and FastAPI 0.133.1: 61 tests and 20 subtests.
The real host smoke registered ten tools, mounted the gateway router and
verified bidirectional tool/REST state sharing. Its solve returned OPTIMAL and
the independent checker reported zero violations.

The exact reports are `submission/verification/hermes-doctor.json`,
`hermes-catalog.json`, `hermes-python-tests.txt` and `runtime-smoke.json`.
`checked-source.json` records the runtime and build input fingerprints. Three
files received an end-of-file blank-line cleanup after the checked snapshot;
their remaining bytes match, and the other checked files match byte for byte.
These results support this development milestone. They do not replace the
pending native Desktop session, recording or release-commit validation.

### Installable MVP checks completed on 6 November

The next implementation snapshot passed 73 Python tests and 20 subtests on
both Python 3.12.14 and the supported Hermes Python 3.14.9 runtime. The actual
Hermes doctor passed, and isolated catalog validation with dependency
installation passed all 16 checks with zero warnings.

A fresh normal-wheel installation served its packaged HTML and JavaScript,
solved the two-change example, preserved the baseline until Apply, exported
both CSV formats and retained state for a separate CLI process. A clean npm
rebuild reproduced all three committed assets byte for byte. Frontend checks
passed 14 logic/API tests, 13 interaction tests and 8 native adapter tests.
The SDK projection matches 36 public source anchors in Hermes v0.22.7.

Current reports and exact source fingerprints are in
`submission/verification/installable/`; `docs/VERIFICATION.md` explains their
scope and maps the checked source to its GitHub implementation commit. The
original reports above remain historical. Actual Desktop rendering, file-picker
operation, media and final public-release validation are still pending.

## Disclosure for README and PR

The plugin processes a user-supplied schedule locally. It stores staff names,
role qualifications, availability, assignments, pins and revision history in
the active Hermes profile's own plugin data directory. Treat that database and
CSV exports as staffing data. No encryption-at-rest claim is made.

The runtime plugin does not send schedules to a third-party service. Its own
REST calls use the existing Hermes connection, which may point at a remote
user-configured Hermes server. If the user gives roster information to their
agent, Hermes's selected language model receives that chat/tool context under
the user's model configuration. The plugin makes no independent model calls.

Installation downloads declared Python dependencies from the configured package
index, including Google OR-Tools and its native solver wheel. The repository
does not bundle compiled native payloads. The Desktop bundle is generated from
included source. No self-updater, telemetry, stored credentials, external
messaging, shell execution, arbitrary path reads, or long-running background
service is part of the plugin's scheduling operations. The separate developer
preview runs a local HTTP server when explicitly launched.

## Files prepared for submission

- `submission/catalog-entry.yaml.in` is intentionally invalid until real release values are supplied.
- `submission/catalog-pr.md` is a draft PR body with explicit evidence placeholders.
- `submission/demo-script.md` is a recording plan, not a recorded demonstration.
- `submission/social-post.txt` is an unsent draft.
- `submission/form-notes.md` tracks the missing public links and form verification.

None of these drafts proves acceptance or submission. Do not replace missing
values with plausible examples. Use the published repository, committed release
SHA, uploaded video and opened PR that actually exist.
