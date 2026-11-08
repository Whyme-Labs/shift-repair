# Native demo record

[Watch the completed demo](media/shiftrepair-native-demo.mp4): 60.08 seconds,
H.264, 1280 × 900, captioned, with a silent audio track. Recorded on 8 November
2026 in the real Hermes v0.22.7 Electron application on macOS. The plugin source
was exact commit `3c27bb35693c9fca11fd769a2791643f747d0648`.

All people and schedules are fictional. The native UI calls the actual plugin
backend. This is a native UI demonstration; no model-backed chat is shown.

| Time | Actual recorded behavior |
| --- | --- |
| 0–8 seconds | Valid eight-person, 28-assignment example in native Hermes |
| 8–11 seconds | Asha marked unavailable Monday |
| 11–19 seconds | OPTIMAL two-change proposal, 26 assignments preserved |
| 19–23 seconds | Review and Apply |
| 23–25 seconds | Chen also marked unavailable Monday, on the same current rota |
| 25–34 seconds | INFEASIBLE: two lead positions, only one available qualified lead |
| 34–40 seconds | Explicit Iris (demo), Lead, Monday, weekly limit one entered in the real Add cover dialog |
| 40–48 seconds | OPTIMAL one-change proposal, 27 current assignments preserved |
| 48–53 seconds | Apply and request native CSV export |
| 53–60 seconds | Successful export notice; real CSV contains 28 assignments and three pins |

The roster was not reset between cases. The first repair moved Chen to Monday;
the second repair replaced Chen with Iris on the current accepted rota. The
recording shows that actual sequence instead of substituting a prepared result.

Editing removed setup and the wait in the native folder picker. No solver
result, application state or latency label was replaced. Captions occupy a
separate band below the complete app image. The raw recording and timing log
are retained locally; [edit provenance](verification/macos-native-20261108/demo-edit.json)
records the selected segments. The OS picker image is not published because its
sidebar contains local machine details. Its successful file is included as
[the fictional exported schedule](verification/macos-native-20261108/demo-schedule.csv).

The [X post](https://x.com/wms2537/status/2119229875643121842) is published.
The form subsequently confirmed receipt; see [the submission record](receipt.json).
