import type { BoardView, Candidate, Roster, Slot, SolveResult } from "./types";

const isoDate = (value: string) => new Date(`${value}T12:00:00Z`);

export function weekDays(start: string): string[] {
  const first = isoDate(start);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(first);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(isoDate(date));
}

export function weekLabel(start: string): string {
  const days = weekDays(start);
  return `${dateLabel(days[0], { day: "numeric", month: "short" })} to ${dateLabel(days[6], { day: "numeric", month: "short", year: "numeric" })}`;
}

export function label(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function scheduleRows(slots: Slot[]): { key: string; shift: string; role: string; byDate: Record<string, Slot[]> }[] {
  const rows = new Map<string, { key: string; shift: string; role: string; byDate: Record<string, Slot[]> }>();
  for (const slot of slots) {
    const key = JSON.stringify([slot.shift, slot.role]);
    let row = rows.get(key);
    if (!row) {
      row = { key, shift: slot.shift, role: slot.role, byDate: {} };
      rows.set(key, row);
    }
    (row.byDate[slot.date] ??= []).push(slot);
  }
  return [...rows.values()].sort((a, b) => a.shift.localeCompare(b.shift) || a.role.localeCompare(b.role));
}

export function assignmentCounts(roster: Roster, assignment = roster.baseline): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(roster.people.map((person) => [person.id, 0]));
  for (const id of Object.values(assignment)) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

export function canApply(board: BoardView): boolean {
  const candidate = board.candidate;
  return !!candidate && candidate.base_revision === board.revision && isValidResult(candidate.result);
}

export function isValidResult(result: SolveResult): boolean {
  return (result.status === "OPTIMAL" || result.status === "FEASIBLE") && result.assignment !== null && result.violations.length === 0;
}

export function resultPresentation(candidate: Candidate): { title: string; description: string; tone: "good" | "caution" | "neutral"; proven: boolean } {
  const result = candidate.result;
  if (isValidResult(result)) {
    const count = result.changed_assignments;
    const proven = result.status === "OPTIMAL" && result.optimal;
    return {
      title: count === 0 ? "Your schedule still works" : `${count ?? result.changes.length} ${count === 1 ? "change" : "changes"} to repair the week`,
      description: proven ? "The solver proved that no repair changes fewer assignments." : "A valid repair was found. Fewer changes may still be possible.",
      tone: "good",
      proven,
    };
  }
  if (result.status === "INFEASIBLE") return {
    title: "No schedule fits these rules",
    description: "The solver proved the current rules cannot all be satisfied. Review the conflict below, then change a rule or add qualified cover.",
    tone: "caution", proven: false,
  };
  if (result.status === "UNKNOWN") return {
    title: "No answer within the time limit",
    description: "This does not prove the schedule is impossible. Try solving again or review the current rules.",
    tone: "neutral", proven: false,
  };
  return {
    title: "The repair could not be validated",
    description: "No repair can be applied. Review the reported issue before trying again.",
    tone: "caution", proven: false,
  };
}

export function personId(name: string, existing: string[]): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "relief";
  let id = base;
  let suffix = 2;
  while (existing.includes(id)) id = `${base}-${suffix++}`;
  return id;
}

export function actionLabel(action: string): string {
  const known: Record<string, string> = { demo: "Example loaded", changes: "Rules updated", apply: "Repair applied", undo: "Previous version restored", import: "Project imported", roster: "Roster created" };
  return known[action] ?? (action.includes(" ") ? action : label(action));
}
