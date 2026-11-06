# Verification evidence

The current installable MVP evidence is in `installable/`. Start with
`installable/provenance.json`, `installable/report.json` and
`installable/hermes-checks/report.json`. The GitHub implementation commit has
the exact checked file tree. The full source manifest and runtime/build input
manifest make later documentation-only changes distinguishable.

The installable directory contains the release summary, source manifest,
distribution checksums, actual doctor and catalog outputs, Python test output
and the post-check source integrity result. Build dependency logs and generated
wheels are not committed here. Reproduce them with `scripts/release_check.py`.

`oracle-evidence.json` records the bounded 40-schedule enumeration experiment.

The other files in this directory are historical evidence from the original
MVP. They must not be treated as validation of the current working tree.

No file here establishes an interactive Electron walkthrough, approved visual
layout, competition submission or marketplace acceptance. See
`docs/VERIFICATION.md` and `docs/SUBMISSION.md` for the remaining gates.
