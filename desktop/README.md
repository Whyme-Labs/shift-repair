# ShiftRepair Desktop interface

One React application powers the native Hermes page and the standalone local preview. Both talk to the same Python service. No solver results are generated or simulated in the browser.

## Build and verify

```bash
cd desktop
npm ci
npm run build
npm test
npm run test:ui
npm run test:native
```

`npm run build` checks TypeScript, emits `desktop/plugin.js` for native installation, and writes the standalone `preview/index.html` and `preview/app.js` in the project root. The build rejects native external imports other than `@hermes/plugin-sdk`, `react` and `react/jsx-runtime`. React is bundled locally into the preview. No CDN, remote scripts or development server are required. The standalone bundle intentionally lives outside `desktop/`, so Hermes does not treat bundled ReactDOM as native plugin code.

The backend's `create_app` mounts the preview directory at `/`, after its API router. From the project root:

```bash
shiftrepair --data-dir /tmp/shiftrepair-demo serve
```

Open `http://127.0.0.1:8787`. The standalone preview calls `/api/plugins/shiftrepair`. Its database is separate from Hermes profile data.

## Native integration

The unified plugin contains this compiled file at `desktop/plugin.js`. It registers a `/shiftrepair` route and sidebar item through the public Hermes Desktop SDK. The page uses `ctx.rest`, `ctx.onEvent` for board updates, and `ctx.setInterval` for a three second polling fallback. These registrations leave with the plugin when it is disabled. `useGatewayActivationEpoch` and the active profile reset state on a connection change. In-flight replies and errors are discarded when their scope is no longer current.

Native dialogs use the SDK's `DialogContent`. Other styles are scoped to the plugin component and use documented theme colors. The plugin never mutates core DOM, reads credentials, invokes private imports or evaluates downloaded code.

Native CSV export opens the host-owned folder picker and uses `ctx.files.writeText` with `exclusive: true`. Exported filenames have a timestamp to avoid replacing existing files. Cancelling the picker, changing the connection while it is open or disabling the plugin prevents a later file write. Native import accepts pasted project CSV. The standalone preview also accepts a user-selected file and downloads CSV through a browser save gesture.

The public APIs and runtime format were checked against Hermes **v0.22.7**:

- https://github.com/NousResearch/hermes-agent/blob/v0.22.7/website/docs/developer-guide/desktop-plugin-sdk.md
- https://github.com/NousResearch/hermes-agent/blob/v0.22.7/apps/desktop/src/sdk/index.ts

### Check the SDK contract

`src/sdk.d.ts` is a generated projection of the consumed public signatures. `sdk-contract.json` records 36 source anchors inspected at commit `b200f5bc60e31588ba2cb60e288029c4a54ba5fa`. The verifier checks the public exports, context and file APIs, route payloads, dialog props, profile atom and activation hook against a local Hermes source checkout:

```bash
npm run check:sdk -- --source=/path/to/hermes-agent
```

The command also accepts `HERMES_SOURCE_ROOT`. It reads source and never launches Hermes. It fails if the upstream contract changes or the generated declaration is edited by hand. To review an intentional upgrade, run the same command with `--update`, inspect the generated declaration and contract diff, then run the build and native adapter tests. The pinned Radix Dialog and nanostores packages are type/test dependencies only. They are not bundled into the native entry.

Only consumed context and navigation fields are projected. Gateway event payloads remain opaque because the plugin uses events as refresh signals. This is not a full SDK declaration or a runtime SDK implementation. An actual Hermes Desktop run is still required before claiming end-to-end native compatibility.

## User flow

Load the example, edit availability or assignment limits, and lock positions that must stay fixed. Find a repair, compare the proposal with the current schedule, and inspect every change. A proposal remains separate until Apply. Discard keeps the current schedule. Undo creates a new revision containing the previous content. Its availability comes from the backend's `can_undo` field, independently of the length of the visible audit history.

The interface distinguishes a proven minimum, a feasible solution without a minimum proof, a proven conflict, and a solver timeout. It never labels a timeout as impossible. Conflicts show backend explanations and offer an explicit form for adding qualified cover.

Both CSV exports are available only when the current baseline passes the independent checker. Project CSV includes people and rules and supports roundtrip import. The import form sends the content to the backend for full validation. A late file read cannot replace a newer selection or pasted text.

## Verification scope

`npm test` covers status honesty, stale candidate gates, native transport error decoding, request identity, HTTP failures, timeouts, route confinement, week boundaries, duplicate positions, person identifiers and assignment counts. It also checks IPC-wrapped errors without depending on a shared Error subclass. These focused tests supplement the Python solver/service checks.

`npm run test:ui` uses jsdom and the real React component with a real isolated FastAPI backend. Install the Python preview dependencies in the project's `.venv` first, or set `SHIFTREPAIR_TEST_PYTHON` to the Python executable. It creates and removes a temporary database. The tests cover the full repair flow, infeasibility and explicit cover, CSV export, stale proposals and exhausted Undo. Controlled transport delays then exercise polling without overlapping reads, write recovery locks, failed recovery, stale scope errors, duplicate export clicks and CSV read races. Keyboard checks verify focus and valid tab/panel relationships.

`npm run test:native` type-checks a host double against the generated public contract and imports the actual compiled `desktop/plugin.js` through a test-only SDK module binding. It verifies legal imports, route registration, REST signatures, null folder cancellation, exclusive writes by opaque folder ID, file errors, connection changes during a picker, tracked listener/timer cleanup and native activation remounts. It uses the real nanostores React hooks with controlled atoms. The host, file operations and dialog surfaces are test doubles.

Current checks pass with 14 unit/API tests, 13 UI interaction tests and 8 native adapter tests. None of these checks verifies rendered pixels, Electron loading, the actual Hermes file picker or a live Desktop profile switch. The supported-browser visual review and real Hermes Desktop walkthrough remain pending.
