# Working demo recording plan

Target length: 80 to 85 seconds. Record actual Hermes Desktop and chat against
the released plugin, then trim pauses. This file is a plan, not demo evidence.
Use the included fictional roster, never a real staff roster.

| Time | Action on screen | Suggested narration |
| --- | --- | --- |
| 0 to 7 seconds | Open the native ShiftRepair board with the example loaded | "One absence can break a weekly roster. ShiftRepair repairs it inside Hermes." |
| 7 to 22 seconds | Ask Hermes to mark the person assigned to the first slot unavailable on that date | "Chat and this board share one versioned schedule. That change now makes the current assignment invalid." |
| 22 to 38 seconds | Ask Hermes to propose a repair. Show the candidate diff and actual solver status | "The solver minimizes changed assignments. This result is proven optimal, and a separate checker verifies every assignment." |
| 38 to 48 seconds | Show affected assignments, then click Apply | "I review the exact changes before applying them." |
| 48 to 66 seconds | Pin an unavailable person to a slot, then solve and show the conflict | "When constraints contradict each other, it explains the conflict. It does not invent availability or silently break the pin." |
| 66 to 77 seconds | Undo the conflicting change and show the restored valid board | "Edits have revisions and undo history. Stale agent edits cannot overwrite a newer board." |
| 77 to 85 seconds | Export the valid schedule and show the real project link | "A small scheduling model, a verified repair, and a usable handoff. ShiftRepair for Hermes." |

## Before recording

Run the scene end to end once on the release build. Select the exact person,
date and pin from the current fixture and write them into your spoken script.
Do not depend on a solver choosing a particular staff member when several
equally optimal schedules exist. Focus on the changed-assignment count and the
verified result.

Use the word "proven" only while the displayed result is OPTIMAL. If the solver
returns FEASIBLE, say "a valid candidate" and show that minimum disruption is
not proven. If it returns UNKNOWN, record the honest timeout and retry under
the published demo settings instead of replacing the UI result in editing.

Keep the cursor, font and labels readable. Show the real host navigation so a
judge can tell this is a native plugin. Keep one continuous segment through
the absence, solve and Apply sequence. Use ordinary cuts for setup and pauses,
and do not insert mocked tool output, pre-rendered success states or invented
latency labels.

The API smoke test and standalone preview are development evidence. The final
competition clip must show the plugin working in Hermes. Capture at least one
frame with the real plugin version and preserve the uncut recording privately.
