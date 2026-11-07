import { canApply, dateLabel, isValidResult, label, resultPresentation } from "./model";
import { Icon } from "./icons";
import type { BoardView } from "./types";

export function RepairPanel({ board, busy, apply, discard, addPerson, solve }: { board: BoardView; busy: string | null; apply: () => void; discard: () => void; addPerson: () => void; solve: () => void }) {
  const { candidate, roster, validation } = board;
  const people = Object.fromEntries(roster.people.map((person) => [person.id, person.name]));
  const slots = Object.fromEntries(roster.slots.map((slot) => [slot.id, slot]));
  const result = candidate?.result;
  const presentation = candidate ? resultPresentation(candidate) : null;
  return <aside className="sr-repair-panel" aria-labelledby="sr-repair-title">
    <div className="sr-panel-eyebrow"><Icon name="repair" /><span>Repair review</span></div>
    {busy === "Finding a repair" ? <div className="sr-solving" role="status"><div className="sr-spinner" /><h2 id="sr-repair-title">Finding the smallest repair</h2><p>Checking availability, qualifications, coverage, weekly limits and locked positions.</p><span className="sr-caption">The current schedule stays in place.</span></div> : candidate && result && presentation ? <>
      <span className={`sr-status-badge sr-status-${presentation.tone}`}>{presentation.proven ? "Minimum changes proved" : isValidResult(result) ? "Valid repair found" : result.status === "INFEASIBLE" ? "Conflict found" : "Needs review"}</span>
      <h2 id="sr-repair-title">{presentation.title}</h2>
      <p className="sr-panel-description">{presentation.description}</p>
      {isValidResult(result) && <div className="sr-repair-stats"><div><strong>{result.changed_assignments ?? result.changes.length}</strong><span>changed</span></div><div><strong>{roster.slots.length - (result.changed_assignments ?? result.changes.length)}</strong><span>kept in place</span></div><div><strong>{result.elapsed_seconds < .01 ? "<0.01" : result.elapsed_seconds.toFixed(2)}s</strong><span>solve time</span></div></div>}
      {result.changes.length > 0 && <ol className="sr-diff-list" aria-label="Exact assignment changes">{result.changes.map((item) => {
        const slot = slots[item.slot_id];
        return <li key={item.slot_id}><div className="sr-diff-date">{slot ? `${dateLabel(slot.date)} · ${slot.shift} ${label(slot.role)}` : item.slot_id}</div><div className="sr-diff-people"><span>{people[item.from_person_id] ?? item.from_person_id}</span><Icon name="arrow" width="16" height="16" /><strong>{people[item.to_person_id] ?? item.to_person_id}</strong></div></li>;
      })}</ol>}
      {(result.conflicts.length > 0 || result.violations.length > 0) && <ul className="sr-conflict-list">{[...result.conflicts, ...result.violations].map((conflict, index) => <li key={`${conflict.code}-${index}`}><Icon name="alert" width="16" height="16" /><span>{conflict.message}</span></li>)}</ul>}
      {candidate.base_revision !== board.revision && <p role="alert" className="sr-error-text">This proposal belongs to an older revision. Solve again before applying.</p>}
      <div className="sr-panel-actions">
        {isValidResult(result) ? <button type="button" className="sr-button sr-button-primary sr-button-wide" disabled={!!busy || !canApply(board)} onClick={apply}><Icon name="check" />{busy === "Applying repair" ? "Applying repair…" : result.changes.length ? `Apply ${result.changes.length} ${result.changes.length === 1 ? "change" : "changes"}` : "Confirm current schedule"}</button> : result.status === "INFEASIBLE" ? <button type="button" className="sr-button sr-button-primary sr-button-wide" disabled={!!busy || roster.people.length >= 32} onClick={addPerson}><Icon name="plus" />Add qualified cover</button> : <button type="button" className="sr-button sr-button-primary sr-button-wide" disabled={!!busy} onClick={solve}>Try solving again</button>}
        <button type="button" className="sr-button sr-button-quiet sr-button-wide" disabled={!!busy} onClick={discard}>Discard proposal</button>
      </div>
      <p className="sr-caption">Based on revision {candidate.base_revision}. The current schedule is unchanged.</p>
    </> : <>
      <div className="sr-panel-illustration" aria-hidden="true"><span /><span /><span className="sr-tile-active"><Icon name="repair" width="25" height="25" /></span><span /></div>
      <h2 id="sr-repair-title">Keep the week intact</h2>
      <p className="sr-panel-description">Change someone's availability or lock a position, then find a valid schedule with as few reassignments as possible.</p>
      {validation.length > 0 ? <div className="sr-attention-block"><span className="sr-status-badge sr-status-caution"><Icon name="alert" width="13" height="13" />{validation.length} {validation.length === 1 ? "check needs" : "checks need"} attention</span><ul>{validation.slice(0, 4).map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>{validation.length > 4 && <p>Plus {validation.length - 4} more checks.</p>}</div> : <p className="sr-current-valid"><Icon name="check" width="16" height="16" />The current schedule passes every check.</p>}
      <button type="button" className="sr-button sr-button-primary sr-button-wide" disabled={!!busy} onClick={solve}><Icon name="repair" />Find a repair</button>
      <div className="sr-explainer"><span>01</span><p>Set the facts in <strong>Availability & limits</strong>.</p><span>02</span><p>Review every proposed assignment change.</p><span>03</span><p>Apply the repair when it works for your team.</p></div>
    </>}
  </aside>;
}
