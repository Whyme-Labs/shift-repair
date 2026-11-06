import { useEffect, useRef, useState } from "react";
import { dateLabel, label, personId, weekDays } from "./model";
import { Modal } from "./Modal";
import type { BoardView, Person } from "./types";

export function CoverForm({ board, busy, requestError, onClose, onAdd }: { board: BoardView; busy: boolean; requestError: string | null; onClose: () => void; onAdd: (person: Person) => Promise<boolean> }) {
  const { roster } = board;
  const days = weekDays(roster.week_start);
  const roles = [...new Set(roster.slots.map((slot) => slot.role))].sort();
  const [name, setName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [capacity, setCapacity] = useState(1);
  const [error, setError] = useState("");
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const toggle = (current: string[], value: string) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  return <Modal title="Add qualified cover" onClose={onClose}><form onSubmit={async (event) => {
    event.preventDefault();
    if (!name.trim() || !selectedRoles.length || !availableDays.length) {
      setError("Enter a name and explicitly select at least one role and available day.");
      return;
    }
    setError("");
    const saved = await onAdd({ id: personId(name, roster.people.map((person) => person.id)), name: name.trim(), roles: selectedRoles, available_days: availableDays, max_assignments: capacity });
    if (saved && alive.current) onClose();
  }}>
    <p className="sr-form-intro">Enter a real person and confirm their qualifications and availability. Adding cover changes the rules. Solve again to review the repair.</p>
    <label className="sr-field">Name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} autoFocus autoComplete="off" placeholder="Name of the person covering" disabled={busy} /></label>
    <fieldset className="sr-fieldset"><legend>Qualified roles</legend><div className="sr-check-options">{roles.map((role) => <label key={role}><input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => setSelectedRoles(toggle(selectedRoles, role))} disabled={busy} />{label(role)}</label>)}</div></fieldset>
    <fieldset className="sr-fieldset"><legend>Confirmed available days</legend><div className="sr-day-options">{days.map((date) => <label key={date}><input type="checkbox" checked={availableDays.includes(date)} onChange={() => setAvailableDays(toggle(availableDays, date))} disabled={busy} /><span>{dateLabel(date, { weekday: "short" })}<small>{dateLabel(date, { day: "numeric" })}</small></span></label>)}</div></fieldset>
    <label className="sr-field">Maximum assignments this week<select value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} disabled={busy}>{Array.from({ length: 7 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} {value === 1 ? "assignment" : "assignments"}</option>)}</select></label>
    {(error || requestError) && <p role="alert" className="sr-error-text">{error || requestError}</p>}
    <div className="sr-modal-actions"><button type="button" className="sr-button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="sr-button sr-button-primary" disabled={busy}>{busy ? "Adding cover…" : "Add cover"}</button></div>
  </form></Modal>;
}

export function ImportForm({ board, busy, mode, requestError, onClose, onImport }: { board: BoardView | null; busy: boolean; mode: "desktop" | "preview"; requestError: string | null; onClose: () => void; onImport: (content: string) => Promise<boolean> }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const readRequest = useRef(0);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; ++readRequest.current; };
  }, []);
  return <Modal title="Import project CSV" onClose={onClose}><form onSubmit={async (event) => {
    event.preventDefault();
    if (reading) return;
    if (!content.trim()) { setError("Choose a project CSV or paste its content first."); return; }
    setError("");
    const saved = await onImport(content);
    if (saved && alive.current) onClose();
  }}>
    <p className="sr-form-intro">A ShiftRepair project CSV includes people, qualifications, availability, positions and the current schedule. A schedule-only export cannot be imported as a project.</p>
    {mode === "preview" && <label className="sr-field">Choose a project CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async (event) => {
      const ticket = ++readRequest.current;
      const file = event.target.files?.[0];
      setReading(false);
      if (!file) return;
      setContent("");
      if (file.size > 1024 * 1024) { setError("The CSV is too large. Use a file smaller than 1 MB."); return; }
      setError("");
      setReading(true);
      const current = () => alive.current && ticket === readRequest.current;
      try {
        const text = await file.text();
        if (current()) setContent(text);
      } catch { if (current()) setError("This file could not be read. Try pasting its content."); }
      finally { if (current()) setReading(false); }
    }} /></label>}
    {reading && <p className="sr-form-note" role="status">Reading project CSV…</p>}
    <label className="sr-field">{mode === "preview" ? "Or paste CSV content" : "Paste project CSV content"}<textarea value={content} onChange={(event) => { ++readRequest.current; setReading(false); setContent(event.target.value); setError(""); }} rows={9} placeholder="Paste the full project CSV here" disabled={busy} spellCheck={false} maxLength={1024 * 1024} /></label>
    {board && <p className="sr-form-note">Importing replaces this board's current content and creates a new revision. You can undo it.</p>}
    {(error || requestError) && <p className="sr-error-text" role="alert">{error || requestError}</p>}
    <div className="sr-modal-actions"><button type="button" className="sr-button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="sr-button sr-button-primary" disabled={busy || reading || !content.trim()}>{busy ? "Importing…" : "Import project"}</button></div>
  </form></Modal>;
}
