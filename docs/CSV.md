# CSV formats

ShiftRepair exports two formats. Both require a currently valid accepted
schedule. A solver proposal does not become an export until it is applied.

## Schedule CSV

The default export is for people to read or print:

```csv
date,shift,role,person_id,name,pinned
2026-11-09,AM,lead,asha,Asha,false
```

It includes one row per position, ordered by date, shift, role and position ID.
It does not include qualifications or availability and cannot be imported as
a complete project. `pinned` is `true` or `false`.

## Project CSV

Choose Export project data to preserve the entire modeled week. Its exact
header is:

```csv
record_type,id,name,week_start,roles,available_days,max_assignments,date,shift,role,assignee,pin
```

| Row type | Required data | Other data |
| --- | --- | --- |
| `roster` | `name`, `week_start` | Exactly one metadata row |
| `person` | `id`, `name`, `roles`, `available_days`, `max_assignments` | Roles and days are JSON arrays inside CSV cells |
| `slot` | `id`, `date`, `shift`, `role`, `assignee` | `pin` is a person ID, or blank |

Columns unrelated to a row type must be blank. A person's empty availability
is the explicit JSON array `[]`. A weekly limit is an integer from 0 through 7.
Dates use `YYYY-MM-DD`. Position and person IDs must be unique and every
assignment must reference an existing person. The existing baseline can
conflict with updated constraints on import, and the board will identify that
condition before a repair is requested.

`examples/cedar-project.csv` is a complete importable example. Importing into
an occupied board requires its current revision and creates an undoable
revision. The file limit is 1 MiB, with no more than one metadata row, 32 people
and 126 positions. Unknown record types, mismatched headers, extra cells,
unsupported fields, malformed JSON and invalid Unicode are errors.

## Spreadsheet formula protection

An exported text cell beginning with `=`, `+`, `-`, `@`, a tab, a line break or
an apostrophe receives a leading apostrophe. This prevents spreadsheet programs
from treating names and labels as formulas. The project importer reverses this
defined escaping, including a doubled leading apostrophe, so a valid round trip
preserves the original text. Standard CSV quoting handles commas and quotes.

Project CSV is a snapshot, not a database backup. It preserves modeled people,
positions, rules and accepted assignments. It does not contain prior revisions
or an unapplied candidate.
