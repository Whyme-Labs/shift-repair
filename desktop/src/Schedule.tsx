import { Icon } from "./icons";
import { dateLabel, label, scheduleRows, weekDays } from "./model";
import type { BoardView, RosterChange } from "./types";

export function Schedule({ board, preview, busy, change }: { board: BoardView; preview: boolean; busy: boolean; change: (changes: RosterChange[]) => void }) {
  const { roster, candidate } = board;
  const days = weekDays(roster.week_start);
  const people = Object.fromEntries(roster.people.map((person) => [person.id, person]));
  const changes = Object.fromEntries((candidate?.result.changes ?? []).map((item) => [item.slot_id, item]));
  const assignment = preview && candidate?.result.assignment ? candidate.result.assignment : roster.baseline;
  const trouble = new Set(board.validation.flatMap((issue) => issue.slot_ids));
  const rows = scheduleRows(roster.slots);
  return <div className="sr-table-scroll" tabIndex={0} aria-label="Weekly schedule, scroll horizontally on a narrow screen">
    <table className="sr-schedule">
      <caption className="sr-only">{preview ? "Proposed" : "Current"} assignments for {roster.name}</caption>
      <thead><tr><th scope="col" className="sr-row-heading">Position</th>{days.map((date) => <th scope="col" key={date}><span>{dateLabel(date, { weekday: "short" })}</span><strong>{dateLabel(date, { day: "numeric" })}</strong></th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.key}>
        <th scope="row" className="sr-row-heading"><span className="sr-shift-label">{row.shift}</span><strong>{label(row.role)}</strong></th>
        {days.map((date) => <td key={date}>{(row.byDate[date] ?? []).map((slot) => {
          const person = people[assignment[slot.id]];
          const edited = preview ? changes[slot.id] : undefined;
          const invalid = !preview && (trouble.has(slot.id) || !person?.available_days.includes(date));
          const pinned = Object.hasOwn(roster.pins, slot.id);
          return <div key={slot.id} className={`sr-assignment${edited ? " sr-assignment-changed" : ""}${invalid ? " sr-assignment-invalid" : ""}`}>
            <div className="sr-assignment-main"><span className="sr-avatar" aria-hidden="true">{person?.name.slice(0, 1) ?? "?"}</span><strong>{person?.name ?? "Unassigned"}</strong></div>
            {edited && <span className="sr-assignment-detail">was {people[edited.from_person_id]?.name ?? edited.from_person_id}</span>}
            {invalid && <span className="sr-assignment-detail"><Icon name="alert" width="12" height="12" />{person && !person.available_days.includes(date) ? "Unavailable" : "Needs review"}</span>}
            <button type="button" className={`sr-pin${pinned ? " sr-pinned" : ""}`} disabled={busy || preview}
              aria-pressed={pinned} aria-label={`${pinned ? "Unlock" : "Lock"} ${person?.name ?? "assignment"}, ${dateLabel(date)}, ${row.shift} ${row.role}`}
              title={preview ? "Apply the proposal before changing locks" : pinned ? "Allow this assignment to move" : "Keep this person in this position"}
              onClick={() => change([{ type: "pin", slot_id: slot.id, person_id: pinned ? null : roster.baseline[slot.id] }])}>
              <Icon name={pinned ? "lock" : "unlock"} width="12" height="12" />
            </button>
          </div>;
        })}{!(row.byDate[date]?.length) && <span className="sr-no-slot" aria-label="No position">·</span>}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
