# ShiftRepair Desktop interface

One React application powers the native Hermes page and the standalone local preview. Both talk to the same Python service. No solver results are generated or simulated in the browser.

## Build and verify

```bash
cd desktop
npm ci
npm run build
npm test
npm run test:ui
```

`npm run build` checks TypeScript, emits `desktop/plugin.js` for native installation, and writes the standalone `preview/index.html` and `preview/app.js` in the project root. The build rejects native external imports other than `@hermes/plugin-sdk`, `react` and `react/jsx-runtime`. React is bundled locally into the preview. No CDN, remote scripts or development server are required. The standalone bundle intentionally lives outside `desktop/`, so Hermes does not treat bundled ReactDOM as native plugin code.

The backend's `create_app` mounts the preview directory at `/`, after its API router. From the project root:

```bash
shiftrepair --data-dir /tmp/shiftrepair-demo serve
```

Open `http://127.0.0.1:8787`. The standalone preview calls `/api/plugins/shiftrepair`. Its database is separate from Hermes profile data.

## Native integration

The unified plugin contains this compiled file at `desktop/plugin.js`. It registers a `/shiftrepair` route and sidebar item through the public Hermes Desktop SDK. The page uses `ctx.rest`, the plugin board update event, and a three second polling fallback. `useGatewayActivationEpoch` and the active profile reset state on a connection change. In-flight replies are discarded when their scope is no longer current.

Native dialogs use the SDK's `DialogContent`. Other styles are scoped to the plugin component and use documented theme colors. The plugin never mutates core DOM, reads credentials, invokes private imports or evaluates downloaded code.

Native CSV export opens the host-owned folder picker and uses `ctx.files.writeText` with `exclusive: true`. Exported filenames have a timestamp to avoid replacing existing files. Native import accepts pasted project CSV. The standalone preview also accepts a user-selected file and downloads CSV through a browser save gesture.

The public APIs and runtime format were checked against Hermes **v0.22.7**:

- https://github.com/NousResearch/hermes-agent/blob/v0.22.7/website/docs/developer-guide/desktop-plugin-sdk.md
- https://github.com/NousResearch/hermes-agent/blob/v0.22.7/apps/desktop/src/sdk/index.ts

`src/sdk.d.ts` is a narrow, local compile-time declaration of those public APIs. It is not a distributed SDK implementation. An actual Hermes Desktop run is still required before claiming end-to-end native compatibility.

## User flow

Load the example, edit availability or assignment limits, and lock positions that must stay fixed. Find a repair, compare the proposal with the current schedule, and inspect every change. A proposal remains separate until Apply. Discard keeps the current schedule. Undo creates a new revision containing the previous content.

The interface distinguishes a proven minimum, a feasible solution without a minimum proof, a proven conflict, and a solver timeout. It never labels a timeout as impossible. Conflicts show backend explanations and offer an explicit form for adding qualified cover.

Schedule CSV is available only when the current baseline passes the independent checker. Project CSV includes people and rules and supports roundtrip import. The import form sends the content to the backend for full validation.

## Verification scope

`npm test` covers status honesty, stale candidate gates, native transport error decoding, request identity, HTTP failures, timeouts, route confinement, week boundaries, duplicate positions, person identifiers and assignment counts. These focused tests supplement the Python solver/service checks. Browser interaction and native host integration are separate checks.

`npm run test:ui` uses jsdom and the real React component with a real isolated FastAPI backend. Install the Python preview dependencies in the project's `.venv` first, or set `SHIFTREPAIR_TEST_PYTHON` to the Python executable. It covers the full two-change repair through apply, schedule CSV export and undo; an infeasible roster resolved by explicitly adding cover; rejection of a proposal after an external edit; and late responses from a previous connection. It creates and removes a temporary database. These tests verify state and event behavior, not rendered pixels or the native Hermes host.
