import type { ComponentType, ReactNode } from "react";

export interface Person {
  id: string;
  name: string;
  roles: string[];
  available_days: string[];
  max_assignments: number;
}

export interface Slot {
  id: string;
  date: string;
  shift: string;
  role: string;
}

export interface Roster {
  name: string;
  week_start: string;
  people: Person[];
  slots: Slot[];
  baseline: Record<string, string>;
  pins: Record<string, string>;
}

export interface Change {
  slot_id: string;
  from_person_id: string;
  to_person_id: string;
}

export interface Violation {
  code: string;
  message: string;
  slot_ids: string[];
  person_ids: string[];
}

export type SolveStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN" | "MODEL_INVALID";

export interface SolveResult {
  status: SolveStatus;
  assignment: Record<string, string> | null;
  changes: Change[];
  changed_assignments: number | null;
  optimal: boolean;
  objective_bound: number | null;
  elapsed_seconds: number;
  violations: Violation[];
  conflicts: Violation[];
}

export interface Candidate {
  id: string;
  base_revision: number;
  result: SolveResult;
  created_at: string;
}

export interface HistoryEntry {
  revision: number;
  action: string;
  created_at: string;
}

export interface BoardView {
  id: string;
  revision: number;
  roster: Roster;
  validation: Violation[];
  candidate: Candidate | null;
  history: HistoryEntry[];
}

export type RosterChange =
  | {type: "availability"; person_id: string; date: string; available: boolean}
  | {type: "pin"; slot_id: string; person_id: string | null}
  | {type: "capacity"; person_id: string; max_assignments: number}
  | {type: "add_person"; person: Person};

export interface RestOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

export type Rest = <T>(path: string, options?: RestOptions) => Promise<T>;
export interface BoardResponse { board: BoardView | null }
export interface ExportFile { filename: string; content: string; mime_type: string }
export type SaveFile = (file: ExportFile) => Promise<"saved" | "cancelled">;
export interface DialogProps { title: string; children: ReactNode; onClose: () => void }

export interface AppProps {
  rest: Rest;
  saveFile: SaveFile;
  mode: "desktop" | "preview";
  getScopeKey?: () => string;
  subscribe?: (refresh: () => void) => () => void;
  dialog?: ComponentType<DialogProps>;
}
