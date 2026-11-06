import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Availability } from "./Availability";
import { errorMessage } from "./api";
import { CoverForm, ImportForm } from "./Forms";
import { Icon } from "./icons";
import { actionLabel, isValidResult, weekLabel } from "./model";
import { Modal, ModalContext } from "./Modal";
import { RepairPanel } from "./RepairPanel";
import { Schedule } from "./Schedule";
import styles from "./styles.css";
import type { AppProps, ExportFile, RosterChange } from "./types";
import { useBoard } from "./useBoard";

export function ShiftRepairApp(props: AppProps) {
  const { board, loading, busy, error, connectionError, notice, refresh, mutate, setError, setNotice } = useBoard(props);
  const [tab, setTab] = useState<"schedule" | "availability">("schedule");
  const [view, setView] = useState<"current" | "proposal">("proposal");
  const [modal, setModal] = useState<"reset" | "cover" | "import" | "history" | null>(null);
  const [exporting, setExporting] = useState(false);
  const scheduleTab = useRef<HTMLButtonElement>(null);
  const availabilityTab = useRef<HTMLButtonElement>(null);
  const blocked = !!busy || exporting;
  const validCandidate = !!board?.candidate && board.candidate.base_revision === board.revision && isValidResult(board.candidate.result);
  const preview = validCandidate && view === "proposal";
  const changeTabWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "schedule" : event.key === "End" ? "availability" : tab === "schedule" ? "availability" : "schedule";
    setTab(next);
    (next === "schedule" ? scheduleTab : availabilityTab).current?.focus();
  };

  const change = async (changes: RosterChange[]) => {
    if (!board) return false;
    return mutate("/changes", { expected_revision: board.revision, changes }, "Saving rules", "Rules saved. Find a repair to check the updated schedule.");
  };
  const solve = async () => {
    if (!board) return;
    if (await mutate("/solve", { expected_revision: board.revision }, "Finding a repair")) { setView("proposal"); setTab("schedule"); }
  };
  const loadDemo = async () => {
    if (await mutate("/demo", {}, "Loading example", "Example loaded. Try marking Asha unavailable on Monday.")) { setTab("schedule"); setView("proposal"); setModal(null); }
  };
  const download = async (kind: "schedule" | "project") => {
    if (blocked) return;
    const scope = props.getScopeKey?.();
    setExporting(true);
    setError(null);
    try {
      const file = await props.rest<ExportFile>(kind === "project" ? "/export?kind=project" : "/export");
      if (scope !== props.getScopeKey?.()) throw new Error("The active connection changed. Download again from the current board.");
      const result = await props.saveFile(file);
      if (result === "saved") setNotice(kind === "project" ? "Project CSV exported with people, availability and rules." : "Current schedule exported as CSV.");
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setExporting(false); }
  };

  return <ModalContext.Provider value={props.dialog}><div className="sr-app">
    <style>{styles}</style>
    <header className="sr-header"><div className="sr-brand"><div className="sr-mark" aria-hidden="true"><span /><span /><span /><span /></div><div><strong>ShiftRepair</strong><span>Small changes. A workable week.</span></div></div><div className="sr-header-meta"><span className="sr-environment">{props.mode === "desktop" ? "Hermes plugin" : "Local preview"}</span><button type="button" className="sr-icon-button" aria-label="Refresh schedule" disabled={blocked || loading} onClick={() => void refresh()}><Icon name="refresh" /></button></div></header>
    <main className="sr-main">
      {(error || connectionError) && <div className="sr-banner sr-banner-error" role="alert"><Icon name="alert" /><p>{error || `Connection problem. ${connectionError}`}</p><button type="button" className="sr-button sr-button-subtle" disabled={blocked} onClick={() => { setError(null); void refresh(); }}>Refresh</button>{error && <button type="button" className="sr-icon-button" onClick={() => setError(null)} aria-label="Dismiss error"><Icon name="close" width="16" height="16" /></button>}</div>}
      {notice && <div className="sr-banner sr-banner-success" role="status"><Icon name="check" /><p>{notice}</p><button type="button" className="sr-icon-button" onClick={() => setNotice(null)} aria-label="Dismiss notice"><Icon name="close" width="16" height="16" /></button></div>}
      {loading && !board ? <section className="sr-empty" role="status"><div className="sr-spinner" /><h1>Opening your schedule</h1><p>Reading the current board from the ShiftRepair backend.</p></section> : !board ? <section className="sr-empty">
        <div className="sr-empty-art" aria-hidden="true"><div /><div /><div /><div /><div /><div /><div className="sr-empty-art-active"><Icon name="repair" width="32" height="32" /></div><div /><div /></div>
        <span className="sr-eyebrow">A last-minute absence. A smaller repair.</span><h1>Keep the rest of the week intact.</h1><p>When staffing changes, ShiftRepair finds a valid schedule with the fewest assignment changes it can prove. You review the difference before applying it.</p>
        <div className="sr-empty-actions"><button type="button" className="sr-button sr-button-primary" onClick={() => void loadDemo()} disabled={blocked}><Icon name="calendar" />{busy === "Loading example" ? "Loading example…" : "Open the example week"}</button><button type="button" className="sr-button" disabled={blocked} onClick={() => setModal("import")}><Icon name="upload" />Import project CSV</button></div>
        <span className="sr-caption">8 people · 28 positions · a real constraint solver · no model API key needed</span>
      </section> : <>
        <section className="sr-heading-row"><div><span className="sr-eyebrow">Weekly staffing</span><h1>{board.roster.name}</h1><p><Icon name="calendar" width="16" height="16" />{weekLabel(board.roster.week_start)}<span className="sr-separator">/</span><button type="button" className="sr-revision" onClick={() => setModal("history")}>Revision {board.revision}<Icon name="chevron" width="12" height="12" /></button></p></div><div className="sr-heading-actions"><button type="button" className="sr-button" onClick={() => void mutate("/undo", { expected_revision: board.revision }, "Restoring revision", "Previous content restored as a new revision.")} disabled={blocked || board.history.length < 2}><Icon name="undo" width="16" height="16" />Undo</button><button type="button" className="sr-button" onClick={() => void download("schedule")} disabled={blocked || board.validation.length > 0} title={board.validation.length ? "Repair the current schedule before exporting" : "Download the current schedule, not the unaccepted proposal"}><Icon name="download" width="16" height="16" />{exporting ? "Exporting…" : "Export schedule"}</button></div></section>
        <div className="sr-workspace">
          <div className="sr-board-column">
            <section className="sr-board-card">
              <div className="sr-board-toolbar"><div className="sr-tabs" role="tablist" aria-label="Schedule and team rules"><button ref={scheduleTab} type="button" role="tab" tabIndex={tab === "schedule" ? 0 : -1} aria-selected={tab === "schedule"} aria-controls="sr-schedule-panel" id="sr-schedule-tab" onKeyDown={changeTabWithKeyboard} onClick={() => setTab("schedule")}><Icon name="calendar" width="16" height="16" />Schedule</button><button ref={availabilityTab} type="button" role="tab" tabIndex={tab === "availability" ? 0 : -1} aria-selected={tab === "availability"} aria-controls="sr-availability-panel" id="sr-availability-tab" onKeyDown={changeTabWithKeyboard} onClick={() => setTab("availability")}><Icon name="people" width="16" height="16" />Availability & limits</button></div><span className="sr-board-count">{board.roster.people.length} people · {board.roster.slots.length} positions</span></div>
              <div className="sr-view-bar"><p>{tab === "availability" ? "Select a day to change availability. Set each person's weekly limit." : preview ? "Proposed schedule. Highlighted positions change when you apply." : "Current schedule. Lock an assignment to keep that person in place."}</p>{validCandidate && tab === "schedule" && <div className="sr-segmented" role="group" aria-label="Schedule version"><button type="button" aria-pressed={view === "current"} onClick={() => setView("current")}>Current</button><button type="button" aria-pressed={view === "proposal"} onClick={() => setView("proposal")}>Proposal</button></div>}</div>
              {tab === "schedule" ? <div role="tabpanel" id="sr-schedule-panel" aria-labelledby="sr-schedule-tab"><Schedule board={board} preview={preview} busy={blocked} change={(changes) => void change(changes)} /><div className="sr-table-footer"><div className="sr-legend"><span><i className="sr-legend-change" />Proposed change</span><span><i className="sr-legend-issue" />Needs attention</span><span><Icon name="lock" width="12" height="12" />Locked</span></div><span>{connectionError ? "Connection interrupted" : "Refreshes every 3 seconds"}</span></div></div> : <div role="tabpanel" id="sr-availability-panel" aria-labelledby="sr-availability-tab"><Availability board={board} busy={blocked} change={(changes) => void change(changes)} addPerson={() => setModal("cover")} /></div>}
            </section>
            <section className="sr-rules-card" aria-labelledby="sr-rules-title"><div className="sr-rules-title"><Icon name="check" width="16" height="16" /><h2 id="sr-rules-title">Rules every repair must satisfy</h2></div><div className="sr-rules"><span>Every position filled</span><span>Qualified people only</span><span>Available days only</span><span>One assignment per person per day</span><span>Weekly limits respected</span><span>{Object.keys(board.roster.pins).length} locked {Object.keys(board.roster.pins).length === 1 ? "position" : "positions"}</span></div></section>
            <section className="sr-demo-note"><span className="sr-demo-note-icon"><Icon name="repair" /></span><div><strong>Try a disruption</strong><p>Open Availability & limits and mark {board.roster.people.some((person) => person.id === "asha") ? "Asha unavailable on Monday" : "a scheduled person unavailable"}. Find a repair and inspect exactly who moves.</p></div><button type="button" className="sr-button sr-button-subtle" onClick={() => setTab("availability")}>Edit availability<Icon name="arrow" width="15" height="15" /></button></section>
            <footer className="sr-board-bottom"><div><button type="button" onClick={() => setModal("import")} disabled={blocked}>Import project CSV</button><button type="button" onClick={() => void download("project")} disabled={blocked || board.validation.length > 0} title={board.validation.length ? "Repair the current schedule before exporting" : "Download the full current project with people and rules"}>Export project data</button><button type="button" onClick={() => setModal("reset")} disabled={blocked}>Reset example</button></div><span>Explicit changes · reversible revisions</span></footer>
          </div>
          <RepairPanel board={board} busy={busy} solve={() => void solve()} apply={() => { if (board.candidate) void mutate("/apply", { expected_revision: board.revision, candidate_id: board.candidate.id }, "Applying repair", "Repair applied. The current schedule is updated and checked."); }} discard={() => { if (board.candidate) void mutate("/discard", { expected_revision: board.revision, candidate_id: board.candidate.id }, "Discarding proposal", "Proposal discarded. The current schedule is unchanged."); }} addPerson={() => setModal("cover")} />
        </div>
      </>}
      {busy && busy !== "Finding a repair" && <div className="sr-operation" role="status"><div className="sr-spinner" />{busy}…</div>}
    </main>
    {modal === "reset" && <Modal title="Reset to the example week?" onClose={() => setModal(null)}><p className="sr-form-intro">This replaces the current people, rules and assignments with the original example. The reset creates a revision you can undo. Export project data if you also want a portable copy.</p><div className="sr-modal-actions"><button type="button" className="sr-button" disabled={blocked} onClick={() => setModal(null)}>Cancel</button><button type="button" className="sr-button sr-button-primary" disabled={blocked} onClick={() => void loadDemo()}>Reset example</button></div></Modal>}
    {modal === "cover" && board && <CoverForm board={board} busy={blocked} requestError={error} onClose={() => setModal(null)} onAdd={(person) => change([{ type: "add_person", person }])} />}
    {modal === "import" && <ImportForm board={board} busy={blocked} mode={props.mode} requestError={error} onClose={() => setModal(null)} onImport={(content) => mutate("/import", { content, ...(board ? { expected_revision: board.revision } : {}) }, "Importing project", "Project imported. The current schedule has been checked.")} />}
    {modal === "history" && board && <Modal title="Revision history" onClose={() => setModal(null)}><p className="sr-form-intro">Changes create new revisions. Undo restores prior content while keeping this history.</p><ol className="sr-history">{[...board.history].reverse().map((entry) => <li key={entry.revision}><span className="sr-history-number">{entry.revision}</span><div><strong>{actionLabel(entry.action)}</strong><time dateTime={entry.created_at}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at))}</time></div>{entry.revision === board.revision && <span className="sr-status-badge">Current</span>}</li>)}</ol><div className="sr-modal-actions"><button type="button" className="sr-button" onClick={() => setModal(null)}>Done</button></div></Modal>}
  </div></ModalContext.Provider>;
}
