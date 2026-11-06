import { assignmentCounts, dateLabel, label, weekDays } from "./model";
import { Icon } from "./icons";
import type { BoardView, RosterChange } from "./types";

export function Availability({ board, busy, change, addPerson }: { board: BoardView; busy: boolean; change: (changes: RosterChange[]) => void; addPerson: () => void }) {
  const { roster } = board;
  const counts = assignmentCounts(roster);
  const days = weekDays(roster.week_start);
  return <>
    <div className="sr-table-scroll" tabIndex={0} aria-label="Staff availability, scroll horizontally on a narrow screen">
      <table className="sr-availability"><caption className="sr-only">Available days and weekly assignment limits. A check means available, a cross means unavailable.</caption>
        <thead><tr><th scope="col">Team member</th>{days.map((date) => <th key={date} scope="col"><span>{dateLabel(date, { weekday: "short" })}</span><small>{dateLabel(date, { day: "numeric" })}</small></th>)}<th scope="col">Weekly limit</th></tr></thead>
        <tbody>{roster.people.map((person) => <tr key={person.id}>
          <th scope="row"><div className="sr-person-name"><span className="sr-avatar" aria-hidden="true">{person.name[0]}</span><span><strong>{person.name}</strong><small>{person.roles.map(label).join(", ")}</small></span></div></th>
          {days.map((date) => {
            const available = person.available_days.includes(date);
            return <td key={date}><button type="button" className={`sr-availability-toggle ${available ? "sr-is-available" : "sr-is-unavailable"}`} aria-label={`${person.name}, ${dateLabel(date)}, ${available ? "available" : "unavailable"}. Mark ${available ? "unavailable" : "available"}.`} aria-pressed={available} disabled={busy}
              onClick={() => change([{ type: "availability", person_id: person.id, date, available: !available }])}><Icon name={available ? "check" : "close"} width="16" height="16" /></button></td>;
          })}
          <td><div className="sr-limit"><select aria-label={`Weekly assignment limit for ${person.name}`} value={person.max_assignments} disabled={busy} onChange={(event) => change([{ type: "capacity", person_id: person.id, max_assignments: Number(event.target.value) }])}>{Array.from({ length: 8 }, (_, value) => <option key={value} value={value}>{value}</option>)}</select><span>{counts[person.id]} assigned</span></div></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="sr-table-footer"><span>Availability is explicit. Every edit is saved as a new revision.</span><button type="button" className="sr-button sr-button-subtle" onClick={addPerson} disabled={busy || roster.people.length >= 32}><Icon name="plus" width="15" height="15" />Add qualified cover</button></div>
  </>;
}
