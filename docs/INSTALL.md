# Install and check a release

ShiftRepair has two installation paths. The complete source release installs
the Hermes tools, gateway backend and native Desktop interface. The Python
wheel installs the shared scheduling package and standalone browser preview.
A wheel alone is not a complete Hermes plugin.

The commands below use a Bash shell. The tested standalone runtime is Python
3.12. The package permits Python 3.12 through 3.14. Hermes v0.22.7 uses Python
3.14 for its supported plugin runtime. Use the Python environment belonging to
that Hermes installation when checking the native integration.

## Run from a development checkout

The repository is currently private. Clone it with an account that already has
access, then use a project environment:

```bash
git clone https://github.com/Whyme-Labs/shift-repair.git
cd shift-repair
uv venv --python 3.12
uv pip install --python .venv/bin/python -e '.[dev,preview]'
```

Compiled native and browser assets are included in the source tree. Rebuild
them after editing the frontend:

```bash
cd desktop
npm ci
npm run build
cd ..
```

Start the standalone preview with a separate local database:

```bash
.venv/bin/shiftrepair --data-dir .runtime/preview serve --port 8787
```

Open `http://127.0.0.1:8787`. This command binds to localhost. Stop it with
Ctrl+C. The same data directory can be inspected without running the server:

```bash
.venv/bin/shiftrepair --data-dir .runtime/preview board
```

The `preview` extra supplies uvicorn. Core scheduling and the Hermes gateway
adapter do not require that extra. A base install reports the missing extra
when `serve` is requested, while its other CLI commands remain available.

### First solver load on macOS

A fresh macOS installation can spend longer than the browser request timeout
loading OR-Tools' native libraries. Check that import before the first walkthrough:

```bash
.venv/bin/python -c 'from ortools.sat.python import cp_model; print("Solver ready")'
```

Let this command finish. If a solve has already timed out in the interface,
use **Refresh** before retrying. The backend may have finished and saved the
proposal after the browser stopped waiting. Refresh shows that result without
applying it. A runtime sample and a subsequent fast import documented this
first-load delay on the Mac used for the 8 November preview check. No security
settings or library signatures were changed.

## Produce and test a clean release

The release check requires Git, uv, Node and npm. It downloads the declared
build and runtime dependencies into temporary environments. It does not
publish anything, change Hermes profiles or run the catalog admission command.

After rebuilding frontend assets and committing the intended release, run:

```bash
.venv/bin/python scripts/release_check.py --ref HEAD --output ../shiftrepair-release
```

The output directory must be new and outside the repository. A default run
exports the committed `HEAD`, so local edits cannot silently enter the
release. For development verification before committing, opt in explicitly:

```bash
.venv/bin/python scripts/release_check.py --worktree --output ../shiftrepair-worktree-check
```

A worktree check includes current tracked files and untracked files that Git
does not ignore. Its report calls the source a worktree snapshot and records
the base commit separately. It is not evidence for an immutable release commit.
Use `--python /absolute/path/to/python` to choose another supported interpreter
for the fresh installed-package check.

The check performs the following work:

1. Export selected Git source. Reject runtime databases, environments,
   `node_modules`, build caches, symlinks and the obsolete `desktop/preview/`
   output. Require the Python entrypoint, manifests, native bundle and root
   browser bundle.
2. Install the frontend's locked dependencies in a temporary copy, rebuild,
   and compare `desktop/plugin.js`, `preview/index.html` and `preview/app.js`
   byte for byte with the exported files. Stale checked-in assets fail.
3. Build a Python source distribution, then build the wheel from that source
   distribution. Check the packaged browser files and both license files.
4. Install the base wheel normally in a fresh environment. Check the module
   import comes from that environment and uvicorn remains optional. Install
   the preview extra and check dependency consistency. Import the native solver
   under a separate bounded startup check and record its duration before the
   HTTP workflow, which retains its normal request timeout.
5. Start the installed CLI outside the source tree. Fetch the actual HTML and
   JavaScript over localhost. Load the demo, change Asha's Monday availability,
   solve the two-assignment repair, apply it, export both CSV forms and read
   the saved result from a separate CLI process.

The installed smoke uses the real SQLite store, OR-Tools solver and checker.
It does not execute JavaScript in a browser or verify Electron rendering.
The separate native Desktop smoke remains a release gate.

Successful output contains:

| Path | Purpose |
| --- | --- |
| `source/` | Clean full plugin folder for Hermes installation and admission |
| `shiftrepair-source.zip` | Full source archive with fixed ZIP metadata |
| `dist/*.tar.gz` | Python source distribution, including browser assets |
| `dist/*.whl` | Installable Python package and standalone preview |
| `source-manifest.json` | Selected paths, file hashes, sizes and modes |
| `report.json` | Exact source identity, tool versions, commands and smoke results |
| `SHA256SUMS` | Archive and distribution checksums |
| `logs/` | Build, dependency and installed-server evidence |

The source ZIP is repeatable for the same selected file bytes and modes.
Python dependencies use bounded compatibility ranges, so a later run may
resolve newer compatible packages. The report and installed dependency log
record what was actually checked. No claim of a fully locked Python build is
made.

## Install the tested Python wheel

Create an environment outside the source repository. Replace the example
absolute paths with the release output and installation directory you chose:

```bash
uv venv --python 3.12 /absolute/path/to/shiftrepair-venv
uv pip install --python /absolute/path/to/shiftrepair-venv/bin/python '/absolute/path/to/shiftrepair-release/dist/hermes_shiftrepair-0.1.0-py3-none-any.whl[preview]'
/absolute/path/to/shiftrepair-venv/bin/shiftrepair --data-dir /absolute/path/to/preview-data serve
```

The wheel carries its browser assets inside `shiftrepair/_preview`. It does
not depend on the original checkout, npm, an editable installation or the
current working directory. It also carries `LICENSE` and
`THIRD_PARTY_NOTICES.md`, including the bundled React license.

Editable and source installs use the root `preview/` output. The optional
`serve --preview-dir /absolute/path/to/assets` override is available for a
deliberately separate frontend build.

## Install the complete plugin in Hermes

Use the clean `source/` output, not a development tree containing
`desktop/node_modules`. Hermes Desktop copies the native `desktop/` tree;
those development dependencies do not belong in the installed plugin.

Choose the actual Hermes home for the profile you will open in Desktop. The
default profile location is `~/.hermes`. Edit these two absolute paths first:

```bash
SHIFTREPAIR_PROFILE_HOME=/absolute/path/to/selected/hermes-profile
SHIFTREPAIR_SOURCE=/absolute/path/to/shiftrepair-release/source
mkdir -p "$SHIFTREPAIR_PROFILE_HOME/plugins"
ln -s "$SHIFTREPAIR_SOURCE" "$SHIFTREPAIR_PROFILE_HOME/plugins/shiftrepair"
HERMES_HOME="$SHIFTREPAIR_PROFILE_HOME" hermes plugins enable shiftrepair
HERMES_HOME="$SHIFTREPAIR_PROFILE_HOME" hermes plugins doctor shiftrepair --ci
```

The link command fails if that destination already exists. Use an unused
development profile for a first installation. Hermes's normal enable flow
prepares the declared Python package dependencies. There is no `--yes-deps`
flag on `plugins enable` in v0.22.7.

In Hermes Desktop, select that same profile, open **Capabilities > Plugins**,
choose **Rescan**, and enable ShiftRepair. Python plugin enablement and Desktop
plugin enablement are separate. Both must be active for the board to use its
backend. The standalone preview's database is separate from all Hermes
profile databases.

For a remote Hermes backend, install the Python half on the backend and the
Desktop half on the machine running Desktop. Test the selected profile before
recording a demonstration.

Once a release is public, its immutable Git installation uses a real full
40-character release commit:

```bash
hermes plugins install https://github.com/Whyme-Labs/shift-repair --ref ACTUAL_FULL_40_CHARACTER_RELEASE_SHA --yes-deps --enable
```

The repository is still private, so this is a future public-release command
with an explicit placeholder. Do not put a guessed SHA in the catalog. A
`file://` URL can name a local Git repository with commits; it does not install
an uncommitted source folder.

Run the final doctor and catalog checks against the same clean source bytes
that will be pinned, using a dedicated `HERMES_HOME`:

```bash
HERMES_HOME="$SHIFTREPAIR_PROFILE_HOME" hermes plugins doctor "$SHIFTREPAIR_SOURCE" --ci
HERMES_HOME="$SHIFTREPAIR_PROFILE_HOME" hermes plugins validate "$SHIFTREPAIR_SOURCE" --install-deps
```

The install flags and separate Desktop activation flow were checked against
the [Hermes v0.22.7 CLI parser](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/hermes_cli/subcommands/plugins.py)
and [Desktop plugin SDK guide](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk).
See [the submission checklist](SUBMISSION.md) for the remaining public
repository, native demonstration and catalog requirements.
