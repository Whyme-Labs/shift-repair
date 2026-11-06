// src/plugin.tsx
import { Dialog, DialogContent, DialogDescription, DialogTitle, gatewayActivationEpoch, host, ROUTES_AREA, SIDEBAR_NAV_AREA, useGatewayActivationEpoch, useValue } from "@hermes/plugin-sdk";

// src/App.tsx
import { useRef as useRef3, useState as useState3 } from "react";

// src/model.ts
var isoDate = (value) => /* @__PURE__ */ new Date(`${value}T12:00:00Z`);
function weekDays(start) {
  const first = isoDate(start);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(first);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}
function dateLabel(date, options = { weekday: "short", day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(isoDate(date));
}
function weekLabel(start) {
  const days = weekDays(start);
  return `${dateLabel(days[0], { day: "numeric", month: "short" })} to ${dateLabel(days[6], { day: "numeric", month: "short", year: "numeric" })}`;
}
function label(value) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function scheduleRows(slots) {
  const rows = /* @__PURE__ */ new Map();
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
function assignmentCounts(roster, assignment = roster.baseline) {
  const counts = Object.fromEntries(roster.people.map((person) => [person.id, 0]));
  for (const id of Object.values(assignment)) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
function canApply(board) {
  const candidate = board.candidate;
  return !!candidate && candidate.base_revision === board.revision && isValidResult(candidate.result);
}
function isValidResult(result) {
  return (result.status === "OPTIMAL" || result.status === "FEASIBLE") && result.assignment !== null && result.violations.length === 0;
}
function resultPresentation(candidate) {
  const result = candidate.result;
  if (isValidResult(result)) {
    const count = result.changed_assignments;
    const proven = result.status === "OPTIMAL" && result.optimal;
    return {
      title: count === 0 ? "Your schedule still works" : `${count ?? result.changes.length} ${count === 1 ? "change" : "changes"} to repair the week`,
      description: proven ? "The solver proved that no repair changes fewer assignments." : "A valid repair was found. Fewer changes may still be possible.",
      tone: "good",
      proven
    };
  }
  if (result.status === "INFEASIBLE") return {
    title: "No schedule fits these rules",
    description: "The solver proved the current rules cannot all be satisfied. Review the conflict below, then change a rule or add qualified cover.",
    tone: "caution",
    proven: false
  };
  if (result.status === "UNKNOWN") return {
    title: "No answer within the time limit",
    description: "This does not prove the schedule is impossible. Try solving again or review the current rules.",
    tone: "neutral",
    proven: false
  };
  return {
    title: "The repair could not be validated",
    description: "No repair can be applied. Review the reported issue before trying again.",
    tone: "caution",
    proven: false
  };
}
function personId(name, existing) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "relief";
  let id = base;
  let suffix = 2;
  while (existing.includes(id)) id = `${base}-${suffix++}`;
  return id;
}
function actionLabel(action) {
  const known = { demo: "Example loaded", changes: "Rules updated", apply: "Repair applied", undo: "Previous version restored", import: "Project imported", roster: "Roster created" };
  return known[action] ?? (action.includes(" ") ? action : label(action));
}

// src/icons.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var paths = {
  repair: /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx("path", { d: "m14 5 5 5M4 20l9-9M14 5l2-2 5 5-2 2M3 13v-3M1.5 11.5h3M11 3V1M10 2h2M19 18v4M17 20h4" }) }),
  check: /* @__PURE__ */ jsx("path", { d: "m5 12 4 4L19 6" }),
  alert: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "m10.3 4.2-8 14A1.2 1.2 0 0 0 3.4 20h17.2a1.2 1.2 0 0 0 1-1.8l-8-14a1.9 1.9 0 0 0-3.3 0Z" }),
    /* @__PURE__ */ jsx("path", { d: "M12 9v4m0 3v.01" })
  ] }),
  arrow: /* @__PURE__ */ jsx("path", { d: "M4 12h16m-6-6 6 6-6 6" }),
  download: /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx("path", { d: "M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" }) }),
  upload: /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx("path", { d: "M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5" }) }),
  undo: /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx("path", { d: "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" }) }),
  refresh: /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx("path", { d: "M20 7V3l-3 3a8 8 0 1 0 3 9M20 7h-5" }) }),
  lock: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("rect", { x: "5", y: "10", width: "14", height: "11", rx: "2" }),
    /* @__PURE__ */ jsx("path", { d: "M8 10V6a4 4 0 0 1 8 0v4M12 14v3" })
  ] }),
  unlock: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("rect", { x: "5", y: "10", width: "14", height: "11", rx: "2" }),
    /* @__PURE__ */ jsx("path", { d: "M8 10V6a4 4 0 0 1 7-2M12 14v3" })
  ] }),
  plus: /* @__PURE__ */ jsx("path", { d: "M12 5v14M5 12h14" }),
  close: /* @__PURE__ */ jsx("path", { d: "m6 6 12 12M6 18 18 6" }),
  calendar: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("rect", { x: "3", y: "5", width: "18", height: "16", rx: "2" }),
    /* @__PURE__ */ jsx("path", { d: "M7 3v4m10-4v4M3 10h18M8 14h1m6 0h1M8 17h1" })
  ] }),
  people: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("circle", { cx: "9", cy: "8", r: "3" }),
    /* @__PURE__ */ jsx("path", { d: "M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5" })
  ] }),
  clock: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "9" }),
    /* @__PURE__ */ jsx("path", { d: "M12 7v5l3 2" })
  ] }),
  chevron: /* @__PURE__ */ jsx("path", { d: "m9 5 7 7-7 7" })
};
function Icon({ name, ...props }) {
  return /* @__PURE__ */ jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", ...props, children: paths[name] });
}

// src/Availability.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Availability({ board, busy, change, addPerson }) {
  const { roster } = board;
  const counts = assignmentCounts(roster);
  const days = weekDays(roster.week_start);
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsx2("div", { className: "sr-table-scroll", tabIndex: 0, "aria-label": "Staff availability, scroll horizontally on a narrow screen", children: /* @__PURE__ */ jsxs2("table", { className: "sr-availability", children: [
      /* @__PURE__ */ jsx2("caption", { className: "sr-only", children: "Available days and weekly assignment limits. A check means available, a cross means unavailable." }),
      /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
        /* @__PURE__ */ jsx2("th", { scope: "col", children: "Team member" }),
        days.map((date) => /* @__PURE__ */ jsxs2("th", { scope: "col", children: [
          /* @__PURE__ */ jsx2("span", { children: dateLabel(date, { weekday: "short" }) }),
          /* @__PURE__ */ jsx2("small", { children: dateLabel(date, { day: "numeric" }) })
        ] }, date)),
        /* @__PURE__ */ jsx2("th", { scope: "col", children: "Weekly limit" })
      ] }) }),
      /* @__PURE__ */ jsx2("tbody", { children: roster.people.map((person) => /* @__PURE__ */ jsxs2("tr", { children: [
        /* @__PURE__ */ jsx2("th", { scope: "row", children: /* @__PURE__ */ jsxs2("div", { className: "sr-person-name", children: [
          /* @__PURE__ */ jsx2("span", { className: "sr-avatar", "aria-hidden": "true", children: person.name[0] }),
          /* @__PURE__ */ jsxs2("span", { children: [
            /* @__PURE__ */ jsx2("strong", { children: person.name }),
            /* @__PURE__ */ jsx2("small", { children: person.roles.map(label).join(", ") })
          ] })
        ] }) }),
        days.map((date) => {
          const available = person.available_days.includes(date);
          return /* @__PURE__ */ jsx2("td", { children: /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              className: `sr-availability-toggle ${available ? "sr-is-available" : "sr-is-unavailable"}`,
              "aria-label": `${person.name}, ${dateLabel(date)}, ${available ? "available" : "unavailable"}. Mark ${available ? "unavailable" : "available"}.`,
              "aria-pressed": available,
              disabled: busy,
              onClick: () => change([{ type: "availability", person_id: person.id, date, available: !available }]),
              children: /* @__PURE__ */ jsx2(Icon, { name: available ? "check" : "close", width: "16", height: "16" })
            }
          ) }, date);
        }),
        /* @__PURE__ */ jsx2("td", { children: /* @__PURE__ */ jsxs2("div", { className: "sr-limit", children: [
          /* @__PURE__ */ jsx2("select", { "aria-label": `Weekly assignment limit for ${person.name}`, value: person.max_assignments, disabled: busy, onChange: (event) => change([{ type: "capacity", person_id: person.id, max_assignments: Number(event.target.value) }]), children: Array.from({ length: 8 }, (_, value) => /* @__PURE__ */ jsx2("option", { value, children: value }, value)) }),
          /* @__PURE__ */ jsxs2("span", { children: [
            counts[person.id],
            " assigned"
          ] })
        ] }) })
      ] }, person.id)) })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "sr-table-footer", children: [
      /* @__PURE__ */ jsx2("span", { children: "Availability is explicit. Every edit is saved as a new revision." }),
      /* @__PURE__ */ jsxs2("button", { type: "button", className: "sr-button sr-button-subtle", onClick: addPerson, disabled: busy || roster.people.length >= 32, children: [
        /* @__PURE__ */ jsx2(Icon, { name: "plus", width: "15", height: "15" }),
        "Add qualified cover"
      ] })
    ] })
  ] });
}

// src/api.ts
var ApiError = class extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
};
function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "The request could not be completed. Check the connection and try again.";
}
function isStaleError(error) {
  return error instanceof ApiError && error.status === 409 || /stale|revision|changed since|conflict/i.test(errorMessage(error));
}
function normalizeSdkError(error) {
  const message = errorMessage(error);
  const start = message.indexOf("{");
  if (start >= 0) {
    try {
      const data = JSON.parse(message.slice(start));
      if (data.detail?.message) {
        const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : void 0;
        return new ApiError(data.detail.message, status, data.detail.code);
      }
    } catch {
    }
  }
  return error instanceof Error ? error : new Error(message);
}

// src/Forms.tsx
import { useState } from "react";

// src/Modal.tsx
import { createContext, useContext, useEffect, useRef } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var ModalContext = createContext(void 0);
function Modal(props) {
  const Surface = useContext(ModalContext) ?? LocalDialog;
  return /* @__PURE__ */ jsx3(Surface, { ...props });
}
function LocalDialog({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return /* @__PURE__ */ jsxs3("dialog", { ref, className: "sr-modal", "aria-labelledby": "sr-dialog-title", onCancel: (event) => {
    event.preventDefault();
    onClose();
  }, children: [
    /* @__PURE__ */ jsxs3("div", { className: "sr-modal-heading", children: [
      /* @__PURE__ */ jsx3("h2", { id: "sr-dialog-title", children: title }),
      /* @__PURE__ */ jsx3("button", { type: "button", className: "sr-icon-button", "aria-label": "Close dialog", onClick: onClose, children: /* @__PURE__ */ jsx3(Icon, { name: "close" }) })
    ] }),
    children
  ] });
}

// src/Forms.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function CoverForm({ board, busy, requestError, onClose, onAdd }) {
  const { roster } = board;
  const days = weekDays(roster.week_start);
  const roles = [...new Set(roster.slots.map((slot) => slot.role))].sort();
  const [name, setName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [availableDays, setAvailableDays] = useState([]);
  const [capacity, setCapacity] = useState(1);
  const [error, setError] = useState("");
  const toggle = (current, value) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  return /* @__PURE__ */ jsx4(Modal, { title: "Add qualified cover", onClose, children: /* @__PURE__ */ jsxs4("form", { onSubmit: async (event) => {
    event.preventDefault();
    if (!name.trim() || !selectedRoles.length || !availableDays.length) {
      setError("Enter a name and explicitly select at least one role and available day.");
      return;
    }
    setError("");
    const saved = await onAdd({ id: personId(name, roster.people.map((person) => person.id)), name: name.trim(), roles: selectedRoles, available_days: availableDays, max_assignments: capacity });
    if (saved) onClose();
  }, children: [
    /* @__PURE__ */ jsx4("p", { className: "sr-form-intro", children: "Enter a real person and confirm their qualifications and availability. Adding cover changes the rules. Solve again to review the repair." }),
    /* @__PURE__ */ jsxs4("label", { className: "sr-field", children: [
      "Name",
      /* @__PURE__ */ jsx4("input", { value: name, onChange: (event) => setName(event.target.value), required: true, maxLength: 80, autoFocus: true, autoComplete: "off", placeholder: "Name of the person covering", disabled: busy })
    ] }),
    /* @__PURE__ */ jsxs4("fieldset", { className: "sr-fieldset", children: [
      /* @__PURE__ */ jsx4("legend", { children: "Qualified roles" }),
      /* @__PURE__ */ jsx4("div", { className: "sr-check-options", children: roles.map((role) => /* @__PURE__ */ jsxs4("label", { children: [
        /* @__PURE__ */ jsx4("input", { type: "checkbox", checked: selectedRoles.includes(role), onChange: () => setSelectedRoles(toggle(selectedRoles, role)), disabled: busy }),
        label(role)
      ] }, role)) })
    ] }),
    /* @__PURE__ */ jsxs4("fieldset", { className: "sr-fieldset", children: [
      /* @__PURE__ */ jsx4("legend", { children: "Confirmed available days" }),
      /* @__PURE__ */ jsx4("div", { className: "sr-day-options", children: days.map((date) => /* @__PURE__ */ jsxs4("label", { children: [
        /* @__PURE__ */ jsx4("input", { type: "checkbox", checked: availableDays.includes(date), onChange: () => setAvailableDays(toggle(availableDays, date)), disabled: busy }),
        /* @__PURE__ */ jsxs4("span", { children: [
          dateLabel(date, { weekday: "short" }),
          /* @__PURE__ */ jsx4("small", { children: dateLabel(date, { day: "numeric" }) })
        ] })
      ] }, date)) })
    ] }),
    /* @__PURE__ */ jsxs4("label", { className: "sr-field", children: [
      "Maximum assignments this week",
      /* @__PURE__ */ jsx4("select", { value: capacity, onChange: (event) => setCapacity(Number(event.target.value)), disabled: busy, children: Array.from({ length: 7 }, (_, index) => index + 1).map((value) => /* @__PURE__ */ jsxs4("option", { value, children: [
        value,
        " ",
        value === 1 ? "assignment" : "assignments"
      ] }, value)) })
    ] }),
    (error || requestError) && /* @__PURE__ */ jsx4("p", { role: "alert", className: "sr-error-text", children: error || requestError }),
    /* @__PURE__ */ jsxs4("div", { className: "sr-modal-actions", children: [
      /* @__PURE__ */ jsx4("button", { type: "button", className: "sr-button", disabled: busy, onClick: onClose, children: "Cancel" }),
      /* @__PURE__ */ jsx4("button", { type: "submit", className: "sr-button sr-button-primary", disabled: busy, children: busy ? "Adding cover\u2026" : "Add cover" })
    ] })
  ] }) });
}
function ImportForm({ board, busy, mode, requestError, onClose, onImport }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  return /* @__PURE__ */ jsx4(Modal, { title: "Import project CSV", onClose, children: /* @__PURE__ */ jsxs4("form", { onSubmit: async (event) => {
    event.preventDefault();
    if (!content.trim()) {
      setError("Choose a project CSV or paste its content first.");
      return;
    }
    setError("");
    const saved = await onImport(content);
    if (saved) onClose();
  }, children: [
    /* @__PURE__ */ jsx4("p", { className: "sr-form-intro", children: "A ShiftRepair project CSV includes people, qualifications, availability, positions and the current schedule. A schedule-only export cannot be imported as a project." }),
    mode === "preview" && /* @__PURE__ */ jsxs4("label", { className: "sr-field", children: [
      "Choose a project CSV",
      /* @__PURE__ */ jsx4("input", { type: "file", accept: ".csv,text/csv", disabled: busy, onChange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 1024 * 1024) {
          setError("The CSV is too large. Use a file smaller than 1 MB.");
          return;
        }
        try {
          setContent(await file.text());
          setError("");
        } catch {
          setError("This file could not be read. Try pasting its content.");
        }
      } })
    ] }),
    /* @__PURE__ */ jsxs4("label", { className: "sr-field", children: [
      mode === "preview" ? "Or paste CSV content" : "Paste project CSV content",
      /* @__PURE__ */ jsx4("textarea", { value: content, onChange: (event) => setContent(event.target.value), rows: 9, placeholder: "Paste the full project CSV here", disabled: busy, spellCheck: false, maxLength: 1024 * 1024 })
    ] }),
    board && /* @__PURE__ */ jsx4("p", { className: "sr-form-note", children: "Importing replaces this board's current content and creates a new revision. You can undo it." }),
    (error || requestError) && /* @__PURE__ */ jsx4("p", { className: "sr-error-text", role: "alert", children: error || requestError }),
    /* @__PURE__ */ jsxs4("div", { className: "sr-modal-actions", children: [
      /* @__PURE__ */ jsx4("button", { type: "button", className: "sr-button", onClick: onClose, disabled: busy, children: "Cancel" }),
      /* @__PURE__ */ jsx4("button", { type: "submit", className: "sr-button sr-button-primary", disabled: busy || !content.trim(), children: busy ? "Importing\u2026" : "Import project" })
    ] })
  ] }) });
}

// src/RepairPanel.tsx
import { Fragment as Fragment3, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function RepairPanel({ board, busy, apply, discard, addPerson, solve }) {
  const { candidate, roster, validation } = board;
  const people = Object.fromEntries(roster.people.map((person) => [person.id, person.name]));
  const slots = Object.fromEntries(roster.slots.map((slot) => [slot.id, slot]));
  const result = candidate?.result;
  const presentation = candidate ? resultPresentation(candidate) : null;
  return /* @__PURE__ */ jsxs5("aside", { className: "sr-repair-panel", "aria-labelledby": "sr-repair-title", children: [
    /* @__PURE__ */ jsxs5("div", { className: "sr-panel-eyebrow", children: [
      /* @__PURE__ */ jsx5(Icon, { name: "repair" }),
      /* @__PURE__ */ jsx5("span", { children: "Repair review" })
    ] }),
    busy === "Finding a repair" ? /* @__PURE__ */ jsxs5("div", { className: "sr-solving", role: "status", children: [
      /* @__PURE__ */ jsx5("div", { className: "sr-spinner" }),
      /* @__PURE__ */ jsx5("h2", { id: "sr-repair-title", children: "Finding the smallest repair" }),
      /* @__PURE__ */ jsx5("p", { children: "Checking availability, qualifications, coverage, weekly limits and locked positions." }),
      /* @__PURE__ */ jsx5("span", { className: "sr-caption", children: "The current schedule stays in place." })
    ] }) : candidate && result && presentation ? /* @__PURE__ */ jsxs5(Fragment3, { children: [
      /* @__PURE__ */ jsx5("span", { className: `sr-status-badge sr-status-${presentation.tone}`, children: presentation.proven ? "Minimum changes proved" : isValidResult(result) ? "Valid repair found" : result.status === "INFEASIBLE" ? "Conflict found" : "Needs review" }),
      /* @__PURE__ */ jsx5("h2", { id: "sr-repair-title", children: presentation.title }),
      /* @__PURE__ */ jsx5("p", { className: "sr-panel-description", children: presentation.description }),
      isValidResult(result) && /* @__PURE__ */ jsxs5("div", { className: "sr-repair-stats", children: [
        /* @__PURE__ */ jsxs5("div", { children: [
          /* @__PURE__ */ jsx5("strong", { children: result.changed_assignments ?? result.changes.length }),
          /* @__PURE__ */ jsx5("span", { children: "changed" })
        ] }),
        /* @__PURE__ */ jsxs5("div", { children: [
          /* @__PURE__ */ jsx5("strong", { children: roster.slots.length - (result.changed_assignments ?? result.changes.length) }),
          /* @__PURE__ */ jsx5("span", { children: "kept in place" })
        ] }),
        /* @__PURE__ */ jsxs5("div", { children: [
          /* @__PURE__ */ jsxs5("strong", { children: [
            result.elapsed_seconds < 0.01 ? "<0.01" : result.elapsed_seconds.toFixed(2),
            "s"
          ] }),
          /* @__PURE__ */ jsx5("span", { children: "solve time" })
        ] })
      ] }),
      result.changes.length > 0 && /* @__PURE__ */ jsx5("ol", { className: "sr-diff-list", "aria-label": "Exact assignment changes", children: result.changes.map((item) => {
        const slot = slots[item.slot_id];
        return /* @__PURE__ */ jsxs5("li", { children: [
          /* @__PURE__ */ jsx5("div", { className: "sr-diff-date", children: slot ? `${dateLabel(slot.date)} \xB7 ${slot.shift} ${label(slot.role)}` : item.slot_id }),
          /* @__PURE__ */ jsxs5("div", { className: "sr-diff-people", children: [
            /* @__PURE__ */ jsx5("span", { children: people[item.from_person_id] ?? item.from_person_id }),
            /* @__PURE__ */ jsx5(Icon, { name: "arrow", width: "16", height: "16" }),
            /* @__PURE__ */ jsx5("strong", { children: people[item.to_person_id] ?? item.to_person_id })
          ] })
        ] }, item.slot_id);
      }) }),
      (result.conflicts.length > 0 || result.violations.length > 0) && /* @__PURE__ */ jsx5("ul", { className: "sr-conflict-list", children: [...result.conflicts, ...result.violations].map((conflict, index) => /* @__PURE__ */ jsxs5("li", { children: [
        /* @__PURE__ */ jsx5(Icon, { name: "alert", width: "16", height: "16" }),
        /* @__PURE__ */ jsx5("span", { children: conflict.message })
      ] }, `${conflict.code}-${index}`)) }),
      candidate.base_revision !== board.revision && /* @__PURE__ */ jsx5("p", { role: "alert", className: "sr-error-text", children: "This proposal belongs to an older revision. Solve again before applying." }),
      /* @__PURE__ */ jsxs5("div", { className: "sr-panel-actions", children: [
        isValidResult(result) ? /* @__PURE__ */ jsxs5("button", { type: "button", className: "sr-button sr-button-primary sr-button-wide", disabled: !!busy || !canApply(board), onClick: apply, children: [
          /* @__PURE__ */ jsx5(Icon, { name: "check" }),
          busy === "Applying repair" ? "Applying repair\u2026" : result.changes.length ? `Apply ${result.changes.length} ${result.changes.length === 1 ? "change" : "changes"}` : "Confirm current schedule"
        ] }) : result.status === "INFEASIBLE" ? /* @__PURE__ */ jsxs5("button", { type: "button", className: "sr-button sr-button-primary sr-button-wide", disabled: !!busy || roster.people.length >= 32, onClick: addPerson, children: [
          /* @__PURE__ */ jsx5(Icon, { name: "plus" }),
          "Add qualified cover"
        ] }) : /* @__PURE__ */ jsx5("button", { type: "button", className: "sr-button sr-button-primary sr-button-wide", disabled: !!busy, onClick: solve, children: "Try solving again" }),
        /* @__PURE__ */ jsx5("button", { type: "button", className: "sr-button sr-button-quiet sr-button-wide", disabled: !!busy, onClick: discard, children: "Discard proposal" })
      ] }),
      /* @__PURE__ */ jsxs5("p", { className: "sr-caption", children: [
        "Proposal for revision ",
        candidate.base_revision,
        ". Applying creates a new revision you can undo."
      ] })
    ] }) : /* @__PURE__ */ jsxs5(Fragment3, { children: [
      /* @__PURE__ */ jsxs5("div", { className: "sr-panel-illustration", "aria-hidden": "true", children: [
        /* @__PURE__ */ jsx5("span", {}),
        /* @__PURE__ */ jsx5("span", {}),
        /* @__PURE__ */ jsx5("span", { className: "sr-tile-active", children: /* @__PURE__ */ jsx5(Icon, { name: "repair", width: "25", height: "25" }) }),
        /* @__PURE__ */ jsx5("span", {})
      ] }),
      /* @__PURE__ */ jsx5("h2", { id: "sr-repair-title", children: "Keep the week intact" }),
      /* @__PURE__ */ jsx5("p", { className: "sr-panel-description", children: "Change someone's availability or lock a position, then find a valid schedule with as few reassignments as possible." }),
      validation.length > 0 ? /* @__PURE__ */ jsxs5("div", { className: "sr-attention-block", children: [
        /* @__PURE__ */ jsxs5("span", { className: "sr-status-badge sr-status-caution", children: [
          /* @__PURE__ */ jsx5(Icon, { name: "alert", width: "13", height: "13" }),
          validation.length,
          " ",
          validation.length === 1 ? "check needs" : "checks need",
          " attention"
        ] }),
        /* @__PURE__ */ jsx5("ul", { children: validation.slice(0, 4).map((issue, index) => /* @__PURE__ */ jsx5("li", { children: issue.message }, `${issue.code}-${index}`)) }),
        validation.length > 4 && /* @__PURE__ */ jsxs5("p", { children: [
          "Plus ",
          validation.length - 4,
          " more checks."
        ] })
      ] }) : /* @__PURE__ */ jsxs5("p", { className: "sr-current-valid", children: [
        /* @__PURE__ */ jsx5(Icon, { name: "check", width: "16", height: "16" }),
        "The current schedule passes every check."
      ] }),
      /* @__PURE__ */ jsxs5("button", { type: "button", className: "sr-button sr-button-primary sr-button-wide", disabled: !!busy, onClick: solve, children: [
        /* @__PURE__ */ jsx5(Icon, { name: "repair" }),
        "Find a repair"
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "sr-explainer", children: [
        /* @__PURE__ */ jsx5("span", { children: "01" }),
        /* @__PURE__ */ jsxs5("p", { children: [
          "Set the facts in ",
          /* @__PURE__ */ jsx5("strong", { children: "Availability & limits" }),
          "."
        ] }),
        /* @__PURE__ */ jsx5("span", { children: "02" }),
        /* @__PURE__ */ jsx5("p", { children: "Review every proposed assignment change." }),
        /* @__PURE__ */ jsx5("span", { children: "03" }),
        /* @__PURE__ */ jsx5("p", { children: "Apply the repair when it works for your team." })
      ] })
    ] })
  ] });
}

// src/Schedule.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function Schedule({ board, preview, busy, change }) {
  const { roster, candidate } = board;
  const days = weekDays(roster.week_start);
  const people = Object.fromEntries(roster.people.map((person) => [person.id, person]));
  const changes = Object.fromEntries((candidate?.result.changes ?? []).map((item) => [item.slot_id, item]));
  const assignment = preview && candidate?.result.assignment ? candidate.result.assignment : roster.baseline;
  const trouble = new Set(board.validation.flatMap((issue) => issue.slot_ids));
  const rows = scheduleRows(roster.slots);
  return /* @__PURE__ */ jsx6("div", { className: "sr-table-scroll", tabIndex: 0, "aria-label": "Weekly schedule, scroll horizontally on a narrow screen", children: /* @__PURE__ */ jsxs6("table", { className: "sr-schedule", children: [
    /* @__PURE__ */ jsxs6("caption", { className: "sr-only", children: [
      preview ? "Proposed" : "Current",
      " assignments for ",
      roster.name
    ] }),
    /* @__PURE__ */ jsx6("thead", { children: /* @__PURE__ */ jsxs6("tr", { children: [
      /* @__PURE__ */ jsx6("th", { scope: "col", className: "sr-row-heading", children: "Position" }),
      days.map((date) => /* @__PURE__ */ jsxs6("th", { scope: "col", children: [
        /* @__PURE__ */ jsx6("span", { children: dateLabel(date, { weekday: "short" }) }),
        /* @__PURE__ */ jsx6("strong", { children: dateLabel(date, { day: "numeric" }) })
      ] }, date))
    ] }) }),
    /* @__PURE__ */ jsx6("tbody", { children: rows.map((row) => /* @__PURE__ */ jsxs6("tr", { children: [
      /* @__PURE__ */ jsxs6("th", { scope: "row", className: "sr-row-heading", children: [
        /* @__PURE__ */ jsx6("span", { className: "sr-shift-label", children: row.shift }),
        /* @__PURE__ */ jsx6("strong", { children: label(row.role) })
      ] }),
      days.map((date) => /* @__PURE__ */ jsxs6("td", { children: [
        (row.byDate[date] ?? []).map((slot) => {
          const person = people[assignment[slot.id]];
          const edited = preview ? changes[slot.id] : void 0;
          const invalid = !preview && (trouble.has(slot.id) || !person?.available_days.includes(date));
          const pinned = Object.hasOwn(roster.pins, slot.id);
          return /* @__PURE__ */ jsxs6("div", { className: `sr-assignment${edited ? " sr-assignment-changed" : ""}${invalid ? " sr-assignment-invalid" : ""}`, children: [
            /* @__PURE__ */ jsxs6("div", { className: "sr-assignment-main", children: [
              /* @__PURE__ */ jsx6("span", { className: "sr-avatar", "aria-hidden": "true", children: person?.name.slice(0, 1) ?? "?" }),
              /* @__PURE__ */ jsx6("strong", { children: person?.name ?? "Unassigned" })
            ] }),
            edited && /* @__PURE__ */ jsxs6("span", { className: "sr-assignment-detail", children: [
              "was ",
              people[edited.from_person_id]?.name ?? edited.from_person_id
            ] }),
            invalid && /* @__PURE__ */ jsxs6("span", { className: "sr-assignment-detail", children: [
              /* @__PURE__ */ jsx6(Icon, { name: "alert", width: "12", height: "12" }),
              person && !person.available_days.includes(date) ? "Unavailable" : "Needs review"
            ] }),
            /* @__PURE__ */ jsx6(
              "button",
              {
                type: "button",
                className: `sr-pin${pinned ? " sr-pinned" : ""}`,
                disabled: busy || preview,
                "aria-pressed": pinned,
                "aria-label": `${pinned ? "Unlock" : "Lock"} ${person?.name ?? "assignment"}, ${dateLabel(date)}, ${row.shift} ${row.role}`,
                title: preview ? "Apply the proposal before changing locks" : pinned ? "Allow this assignment to move" : "Keep this person in this position",
                onClick: () => change([{ type: "pin", slot_id: slot.id, person_id: pinned ? null : roster.baseline[slot.id] }]),
                children: /* @__PURE__ */ jsx6(Icon, { name: pinned ? "lock" : "unlock", width: "12", height: "12" })
              }
            )
          ] }, slot.id);
        }),
        !row.byDate[date]?.length && /* @__PURE__ */ jsx6("span", { className: "sr-no-slot", "aria-label": "No position", children: "\xB7" })
      ] }, date))
    ] }, row.key)) })
  ] }) });
}

// src/styles.css
var styles_default = '.sr-app {\n  --sr-text: var(--ui-text-secondary);\n  --sr-muted: var(--ui-text-tertiary);\n  --sr-faint: var(--ui-text-quaternary);\n  --sr-border: var(--ui-stroke-secondary);\n  --sr-accent: var(--ui-accent);\n  --sr-soft: color-mix(in srgb, var(--sr-text) 3%, transparent);\n  --sr-accent-soft: color-mix(in srgb, var(--sr-accent) 8%, transparent);\n  --sr-accent-border: color-mix(in srgb, var(--sr-accent) 30%, var(--sr-border));\n  color: var(--sr-text);\n  font-family: inherit;\n  font-size: 14px;\n  line-height: 1.5;\n  min-height: 100%;\n  text-align: left;\n  isolation: isolate;\n}\n.sr-app *, .sr-app *::before, .sr-app *::after { box-sizing: border-box; }\n.sr-app button, .sr-app input, .sr-app select, .sr-app textarea { font: inherit; color: inherit; }\n.sr-app button { cursor: pointer; }\n.sr-app button:disabled { cursor: not-allowed; opacity: .48; }\n.sr-app button:focus-visible, .sr-app input:focus-visible, .sr-app select:focus-visible, .sr-app textarea:focus-visible, .sr-app [tabindex]:focus-visible { outline: 2px solid var(--sr-accent); outline-offset: 3px; }\n.sr-app h1, .sr-app h2, .sr-app p { margin: 0; }\n.sr-app svg { flex-shrink: 0; vertical-align: middle; }\n.sr-app .sr-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px 32px; border-bottom: 1px solid var(--sr-border); }\n.sr-app .sr-brand { display: flex; align-items: center; gap: 12px; }\n.sr-app .sr-brand > div:last-child { display: flex; flex-direction: column; gap: 1px; }\n.sr-app .sr-brand strong { font-size: 17px; letter-spacing: -.5px; }\n.sr-app .sr-brand span { font-size: 11px; color: var(--sr-muted); }\n.sr-app .sr-mark { display: grid; grid-template-columns: repeat(2, 10px); gap: 3px; padding: 8px; border: 1px solid var(--sr-accent-border); border-radius: 10px; background: var(--sr-accent-soft); transform: rotate(-4deg); }\n.sr-app .sr-mark span { width: 10px; height: 10px; border-radius: 2px; background: var(--sr-accent); opacity: .85; }\n.sr-app .sr-mark span:nth-child(2) { transform: translate(2px, -2px); opacity: .35; }\n.sr-app .sr-header-meta { display: flex; align-items: center; gap: 12px; }\n.sr-app .sr-environment { border: 1px solid var(--sr-border); border-radius: 5px; padding: 3px 8px; font-size: 11px; color: var(--sr-muted); }\n.sr-app .sr-main { max-width: 1660px; margin: 0 auto; padding: 30px 32px 50px; }\n.sr-app .sr-heading-row { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 26px; }\n.sr-app .sr-eyebrow { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.6px; color: var(--sr-muted); margin-bottom: 7px; }\n.sr-app .sr-heading-row h1 { font-size: clamp(23px, 2.1vw, 31px); letter-spacing: -1.1px; line-height: 1.2; font-weight: 650; }\n.sr-app .sr-heading-row p { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--sr-muted); font-size: 12px; margin-top: 11px; }\n.sr-app .sr-separator { color: var(--sr-faint); padding: 0 2px; }\n.sr-app .sr-revision { display: inline-flex; align-items: center; gap: 3px; border: 0; padding: 0; background: transparent; font-size: 12px; color: var(--sr-muted); }\n.sr-app .sr-revision:hover { color: var(--sr-accent); }\n.sr-app .sr-heading-actions { display: flex; align-items: center; gap: 8px; }\n.sr-app .sr-button { display: inline-flex; justify-content: center; align-items: center; gap: 7px; border: 1px solid var(--sr-border); border-radius: 7px; padding: 9px 13px; background: transparent; font-size: 12px; font-weight: 550; line-height: 1.5; white-space: nowrap; transition: background-color .15s, border-color .15s; }\n.sr-app .sr-button:hover:not(:disabled) { background: var(--sr-soft); border-color: var(--sr-muted); }\n.sr-app .sr-button-primary { background: color-mix(in srgb, var(--sr-accent) 13%, transparent); color: var(--sr-accent); border-color: color-mix(in srgb, var(--sr-accent) 45%, transparent); font-weight: 650; }\n.sr-app .sr-button-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--sr-accent) 20%, transparent); border-color: var(--sr-accent); }\n.sr-app .sr-button-subtle { padding: 6px 8px; border-color: transparent; color: var(--sr-accent); }\n.sr-app .sr-button-quiet { border-color: transparent; font-weight: 450; color: var(--sr-muted); }\n.sr-app .sr-button-wide { width: 100%; }\n.sr-app .sr-icon-button { display: inline-flex; justify-content: center; align-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; color: var(--sr-muted); background: transparent; flex-shrink: 0; }\n.sr-app .sr-icon-button:hover { background: var(--sr-soft); color: var(--sr-text); }\n.sr-app .sr-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 24px; align-items: start; }\n.sr-app .sr-board-column { min-width: 0; }\n.sr-app .sr-board-card { border: 1px solid var(--sr-border); border-radius: 12px; overflow: hidden; }\n.sr-app .sr-board-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 1px solid var(--sr-border); padding: 0 18px; min-height: 57px; }\n.sr-app .sr-board-count { font-size: 11px; color: var(--sr-muted); white-space: nowrap; }\n.sr-app .sr-tabs { display: flex; align-items: stretch; align-self: stretch; gap: 20px; }\n.sr-app .sr-tabs button { display: flex; align-items: center; gap: 7px; background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--sr-muted); padding: 16px 0 14px; font-size: 12px; white-space: nowrap; }\n.sr-app .sr-tabs button[aria-selected="true"] { color: var(--sr-accent); border-bottom-color: var(--sr-accent); font-weight: 650; }\n.sr-app .sr-view-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 18px; min-height: 56px; background: var(--sr-soft); border-bottom: 1px solid var(--sr-border); }\n.sr-app .sr-view-bar p { font-size: 11px; color: var(--sr-muted); max-width: 570px; }\n.sr-app .sr-segmented { display: inline-flex; padding: 2px; border: 1px solid var(--sr-border); border-radius: 6px; flex-shrink: 0; }\n.sr-app .sr-segmented button { background: transparent; border: 0; border-radius: 4px; padding: 4px 8px; font-size: 10px; color: var(--sr-muted); }\n.sr-app .sr-segmented button[aria-pressed="true"] { background: var(--sr-accent-soft); color: var(--sr-accent); font-weight: 650; }\n.sr-app .sr-table-scroll { overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: thin; }\n.sr-app table { width: 100%; border-collapse: collapse; }\n.sr-app .sr-schedule { min-width: 780px; table-layout: fixed; }\n.sr-app .sr-schedule th, .sr-app .sr-schedule td { border-right: 1px solid var(--sr-border); border-bottom: 1px solid var(--sr-border); }\n.sr-app .sr-schedule tr > :last-child { border-right: 0; }\n.sr-app .sr-schedule tbody tr:last-child > * { border-bottom: 0; }\n.sr-app .sr-schedule thead th { padding: 14px 5px 12px; text-align: center; font-weight: 400; }\n.sr-app .sr-schedule thead th span { display: block; color: var(--sr-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }\n.sr-app .sr-schedule thead th strong { display: block; font-size: 18px; font-weight: 500; margin-top: 2px; }\n.sr-app .sr-schedule .sr-row-heading { width: 82px; text-align: left; padding: 13px 12px; background: var(--sr-soft); }\n.sr-app .sr-schedule thead .sr-row-heading { font-size: 10px; color: var(--sr-muted); }\n.sr-app .sr-schedule tbody th strong { display: block; font-size: 12px; font-weight: 550; }\n.sr-app .sr-shift-label { display: inline-block; color: var(--sr-muted); font-size: 9px; font-weight: 650; letter-spacing: .5px; margin-bottom: 2px; }\n.sr-app .sr-schedule td { padding: 7px 5px; vertical-align: top; height: 85px; }\n.sr-app .sr-assignment { position: relative; border: 1px solid transparent; border-radius: 6px; background: var(--sr-soft); padding: 11px 6px 10px; min-height: 66px; }\n.sr-app .sr-assignment + .sr-assignment { margin-top: 6px; }\n.sr-app .sr-assignment-main { display: flex; align-items: center; gap: 6px; }\n.sr-app .sr-assignment-main strong { font-weight: 550; font-size: 11px; word-break: break-word; padding-right: 3px; }\n.sr-app .sr-avatar { width: 22px; height: 22px; display: inline-flex; justify-content: center; align-items: center; flex-shrink: 0; border-radius: 50%; font-size: 10px; font-weight: 600; background: color-mix(in srgb, var(--sr-text) 8%, transparent); color: var(--sr-muted); }\n.sr-app .sr-assignment-detail { display: flex; align-items: center; gap: 3px; font-size: 9px; line-height: 1.4; margin-top: 6px; color: var(--sr-muted); }\n.sr-app .sr-assignment-changed { background: var(--sr-accent-soft); border-color: var(--sr-accent-border); }\n.sr-app .sr-assignment-changed .sr-assignment-main strong, .sr-app .sr-assignment-changed .sr-assignment-detail { color: var(--sr-accent); }\n.sr-app .sr-assignment-invalid { border-color: var(--sr-muted); border-style: dashed; background: color-mix(in srgb, var(--sr-text) 7%, transparent); }\n.sr-app .sr-assignment-invalid .sr-assignment-detail { font-weight: 600; color: var(--sr-text); }\n.sr-app .sr-pin { position: absolute; display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; right: 1px; bottom: 1px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--sr-muted); opacity: .3; }\n.sr-app .sr-pin:hover:not(:disabled), .sr-app .sr-pin:focus-visible, .sr-app .sr-pin.sr-pinned { opacity: 1; color: var(--sr-accent); background: var(--sr-accent-soft); }\n.sr-app .sr-pin:disabled:not(.sr-pinned) { opacity: .15; }\n.sr-app .sr-no-slot { display: block; text-align: center; color: var(--sr-faint); padding: 15px 0; }\n.sr-app .sr-table-footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 13px 18px; border-top: 1px solid var(--sr-border); font-size: 10px; color: var(--sr-muted); }\n.sr-app .sr-legend { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }\n.sr-app .sr-legend span { display: flex; align-items: center; gap: 5px; }\n.sr-app .sr-legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }\n.sr-app .sr-legend-change { background: var(--sr-accent-soft); border: 1px solid var(--sr-accent); }\n.sr-app .sr-legend-issue { background: var(--sr-soft); border: 1px dashed var(--sr-muted); }\n.sr-app .sr-rules-card { margin-top: 16px; padding: 17px 18px 18px; border: 1px solid var(--sr-border); border-radius: 10px; }\n.sr-app .sr-rules-title { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }\n.sr-app .sr-rules-title > svg { color: var(--sr-accent); }\n.sr-app .sr-rules-title h2 { font-size: 12px; font-weight: 600; }\n.sr-app .sr-rules { display: flex; flex-wrap: wrap; gap: 7px; }\n.sr-app .sr-rules span { font-size: 10px; padding: 4px 8px; border: 1px solid var(--sr-border); border-radius: 5px; color: var(--sr-muted); background: var(--sr-soft); }\n.sr-app .sr-demo-note { display: flex; align-items: center; gap: 13px; padding: 19px 0 14px; }\n.sr-app .sr-demo-note-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: var(--sr-accent-soft); color: var(--sr-accent); flex-shrink: 0; }\n.sr-app .sr-demo-note > div { flex: 1; }\n.sr-app .sr-demo-note strong { font-size: 11px; font-weight: 600; }\n.sr-app .sr-demo-note p { font-size: 11px; color: var(--sr-muted); margin-top: 2px; }\n.sr-app .sr-board-bottom { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid var(--sr-border); padding-top: 15px; font-size: 9px; color: var(--sr-muted); }\n.sr-app .sr-board-bottom > div { display: flex; flex-wrap: wrap; gap: 14px; }\n.sr-app .sr-board-bottom button { padding: 0; background: transparent; border: 0; font-size: 10px; color: var(--sr-muted); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: color-mix(in srgb, var(--sr-muted) 40%, transparent); }\n.sr-app .sr-board-bottom button:hover { color: var(--sr-accent); }\n.sr-app .sr-repair-panel { border: 1px solid var(--sr-border); border-radius: 12px; padding: 22px; position: sticky; top: 16px; }\n.sr-app .sr-panel-eyebrow { display: flex; align-items: center; gap: 8px; color: var(--sr-accent); font-size: 11px; font-weight: 600; margin-bottom: 25px; }\n.sr-app .sr-repair-panel h2 { font-size: 22px; font-weight: 550; line-height: 1.25; letter-spacing: -.7px; margin: 13px 0 12px; }\n.sr-app .sr-panel-description { font-size: 12px; color: var(--sr-muted); line-height: 1.7; }\n.sr-app .sr-panel-illustration { display: grid; grid-template-columns: repeat(2, 34px); gap: 5px; margin: 8px 0 23px; transform: rotate(-5deg); transform-origin: center; width: 73px; }\n.sr-app .sr-panel-illustration span { height: 34px; border: 1px solid var(--sr-border); border-radius: 6px; background: var(--sr-soft); }\n.sr-app .sr-panel-illustration .sr-tile-active { display: flex; align-items: center; justify-content: center; border-color: var(--sr-accent-border); background: var(--sr-accent-soft); color: var(--sr-accent); transform: translate(-3px, 2px); }\n.sr-app .sr-current-valid { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; color: var(--sr-accent); margin: 20px 0; }\n.sr-app .sr-status-badge { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--sr-border); border-radius: 5px; padding: 4px 7px; font-size: 10px; line-height: 1.4; font-weight: 550; color: var(--sr-muted); }\n.sr-app .sr-status-good { color: var(--sr-accent); border-color: var(--sr-accent-border); background: var(--sr-accent-soft); }\n.sr-app .sr-status-caution { color: var(--sr-text); background: var(--sr-soft); border-style: dashed; }\n.sr-app .sr-repair-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; border-top: 1px solid var(--sr-border); border-bottom: 1px solid var(--sr-border); padding: 15px 0; margin: 20px 0 0; }\n.sr-app .sr-repair-stats > div { display: flex; flex-direction: column; gap: 2px; }\n.sr-app .sr-repair-stats strong { font-size: 20px; font-weight: 500; letter-spacing: -.6px; }\n.sr-app .sr-repair-stats span { font-size: 9px; color: var(--sr-muted); }\n.sr-app .sr-diff-list { list-style: none; padding: 0; margin: 0 0 22px; }\n.sr-app .sr-diff-list li { padding: 14px 0; border-bottom: 1px solid var(--sr-border); }\n.sr-app .sr-diff-date { color: var(--sr-muted); font-size: 10px; margin-bottom: 7px; }\n.sr-app .sr-diff-people { display: flex; align-items: center; gap: 12px; font-size: 13px; }\n.sr-app .sr-diff-people > span { color: var(--sr-muted); text-decoration: line-through; text-decoration-color: var(--sr-border); }\n.sr-app .sr-diff-people > svg { color: var(--sr-muted); }\n.sr-app .sr-diff-people strong { font-weight: 600; color: var(--sr-accent); }\n.sr-app .sr-panel-actions { margin-top: 20px; display: flex; flex-direction: column; gap: 6px; }\n.sr-app .sr-caption { color: var(--sr-muted); font-size: 10px; line-height: 1.6; }\n.sr-app .sr-repair-panel > .sr-caption { margin-top: 12px; }\n.sr-app .sr-explainer { display: grid; grid-template-columns: 20px 1fr; gap: 14px 10px; margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--sr-border); }\n.sr-app .sr-explainer > span { color: var(--sr-faint); font-size: 10px; font-variant-numeric: tabular-nums; }\n.sr-app .sr-explainer p { font-size: 11px; color: var(--sr-muted); }\n.sr-app .sr-explainer strong { font-weight: 550; color: var(--sr-text); }\n.sr-app .sr-attention-block { margin: 20px 0; }\n.sr-app .sr-attention-block ul { padding-left: 17px; font-size: 11px; color: var(--sr-muted); margin: 12px 0 0; }\n.sr-app .sr-attention-block li + li { margin-top: 7px; }\n.sr-app .sr-attention-block > p { margin-top: 8px; font-size: 11px; }\n.sr-app .sr-conflict-list { padding: 0; list-style: none; margin: 20px 0; }\n.sr-app .sr-conflict-list li { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; border-top: 1px solid var(--sr-border); padding: 13px 0; line-height: 1.6; }\n.sr-app .sr-conflict-list svg { margin-top: 2px; color: var(--sr-muted); }\n.sr-app .sr-availability { min-width: 790px; }\n.sr-app .sr-availability th, .sr-app .sr-availability td { border-bottom: 1px solid var(--sr-border); padding: 11px 10px; text-align: center; }\n.sr-app .sr-availability tbody tr:last-child > * { border-bottom: 0; }\n.sr-app .sr-availability th:first-child { text-align: left; padding-left: 18px; width: 170px; }\n.sr-app .sr-availability thead th { color: var(--sr-muted); font-size: 10px; font-weight: 450; background: var(--sr-soft); }\n.sr-app .sr-availability thead th span { display: block; }\n.sr-app .sr-availability thead th small { display: block; font-size: 10px; margin-top: 2px; }\n.sr-app .sr-person-name { display: flex; align-items: center; gap: 9px; }\n.sr-app .sr-person-name strong { display: block; font-size: 12px; font-weight: 550; }\n.sr-app .sr-person-name small { display: block; font-size: 9px; color: var(--sr-muted); font-weight: 450; margin-top: 2px; }\n.sr-app .sr-availability-toggle { border: 1px solid var(--sr-border); border-radius: 6px; width: 31px; height: 29px; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: transparent; }\n.sr-app .sr-is-available { color: var(--sr-accent); background: var(--sr-accent-soft); border-color: var(--sr-accent-border); }\n.sr-app .sr-is-unavailable { color: var(--sr-muted); background: var(--sr-soft); border-style: dashed; }\n.sr-app .sr-availability-toggle:hover:not(:disabled) { border-color: var(--sr-text); }\n.sr-app .sr-limit { display: flex; align-items: center; justify-content: center; gap: 8px; }\n.sr-app .sr-limit select { width: 43px; padding: 4px 3px 4px 8px; border: 1px solid var(--sr-border); border-radius: 5px; font-size: 11px; background: transparent; }\n.sr-app .sr-limit > span { font-size: 9px; color: var(--sr-muted); }\n.sr-app .sr-banner { display: flex; align-items: center; gap: 10px; border: 1px solid var(--sr-border); border-radius: 8px; padding: 10px 13px; margin-bottom: 22px; font-size: 12px; }\n.sr-app .sr-banner p { flex: 1; }\n.sr-app .sr-banner-success { background: var(--sr-accent-soft); border-color: var(--sr-accent-border); color: var(--sr-accent); }\n.sr-app .sr-banner-error { border-style: dashed; background: var(--sr-soft); }\n.sr-app .sr-empty { display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 660px; margin: 55px auto 80px; padding: 24px; }\n.sr-app .sr-empty h1 { font-size: clamp(28px, 3.5vw, 42px); font-weight: 550; letter-spacing: -1.7px; line-height: 1.15; margin: 9px 0 18px; }\n.sr-app .sr-empty > p { color: var(--sr-muted); font-size: 14px; line-height: 1.8; max-width: 490px; }\n.sr-app .sr-empty-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; margin: 28px 0 20px; }\n.sr-app .sr-empty-actions .sr-button { padding: 11px 15px; }\n.sr-app .sr-empty-art { display: grid; grid-template-columns: repeat(3, 45px); gap: 6px; margin: 0 0 38px; transform: rotate(-5deg); }\n.sr-app .sr-empty-art > div { height: 45px; border: 1px solid var(--sr-border); border-radius: 7px; background: var(--sr-soft); }\n.sr-app .sr-empty-art > div:nth-child(3), .sr-app .sr-empty-art > div:nth-child(9) { opacity: .4; }\n.sr-app .sr-empty-art .sr-empty-art-active { border-color: var(--sr-accent-border); background: var(--sr-accent-soft); transform: translate(-6px, 6px); color: var(--sr-accent); display: flex; align-items: center; justify-content: center; }\n.sr-app .sr-spinner { width: 22px; height: 22px; border: 2px solid var(--sr-accent-border); border-top-color: var(--sr-accent); border-radius: 50%; animation: sr-spin .8s linear infinite; }\n.sr-app .sr-solving { padding-top: 25px; }\n.sr-app .sr-solving > p { color: var(--sr-muted); font-size: 12px; line-height: 1.7; margin-bottom: 18px; }\n.sr-app .sr-operation { display: flex; align-items: center; gap: 8px; position: fixed; bottom: 20px; right: 25px; padding: 9px 13px; border: 1px solid var(--sr-border); border-radius: 8px; background: var(--sr-surface, Canvas); color: var(--sr-text); font-size: 11px; z-index: 10; }\n.sr-app .sr-operation .sr-spinner { height: 14px; width: 14px; }\n.sr-app .sr-modal { width: min(570px, calc(100vw - 36px)); max-height: calc(100vh - 60px); border: 1px solid var(--sr-border); border-radius: 14px; padding: 25px; margin: auto; color: var(--sr-text); background: var(--sr-surface, Canvas); box-shadow: 0 24px 85px color-mix(in srgb, var(--sr-text) 18%, transparent); }\n.sr-app .sr-modal::backdrop { background: color-mix(in srgb, var(--sr-text) 22%, transparent); backdrop-filter: blur(3px); }\n.sr-app .sr-modal-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }\n.sr-app .sr-native-modal { width: min(520px, calc(100vw - 80px)); }\n.sr-app .sr-modal-heading h2 { font-size: 21px; font-weight: 550; letter-spacing: -.5px; }\n.sr-app .sr-form-intro { color: var(--sr-muted); font-size: 12px; line-height: 1.7; margin-bottom: 21px; }\n.sr-app .sr-field { display: flex; flex-direction: column; gap: 7px; margin: 17px 0; font-size: 12px; font-weight: 550; }\n.sr-app .sr-field input, .sr-app .sr-field textarea, .sr-app .sr-field select { width: 100%; border: 1px solid var(--sr-border); border-radius: 6px; background: var(--sr-soft); padding: 9px 11px; font-weight: 450; }\n.sr-app .sr-field input::placeholder, .sr-app .sr-field textarea::placeholder { color: var(--sr-muted); }\n.sr-app .sr-field textarea { resize: vertical; font-family: ui-monospace, monospace; font-size: 11px; }\n.sr-app .sr-fieldset { padding: 0; margin: 18px 0; border: 0; }\n.sr-app .sr-fieldset legend { font-size: 12px; font-weight: 550; padding: 0; margin-bottom: 10px; }\n.sr-app .sr-check-options { display: flex; gap: 10px 18px; flex-wrap: wrap; }\n.sr-app .sr-check-options label { display: flex; align-items: center; gap: 7px; font-size: 12px; }\n.sr-app input[type="checkbox"] { accent-color: var(--sr-accent); }\n.sr-app .sr-day-options { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }\n.sr-app .sr-day-options label { display: flex; align-items: center; flex-direction: column; gap: 5px; padding: 9px 4px; border: 1px solid var(--sr-border); border-radius: 6px; cursor: pointer; }\n.sr-app .sr-day-options label:has(input:checked) { border-color: var(--sr-accent-border); background: var(--sr-accent-soft); }\n.sr-app .sr-day-options span { font-size: 10px; text-align: center; }\n.sr-app .sr-day-options small { display: block; color: var(--sr-muted); }\n.sr-app .sr-modal-actions { display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--sr-border); padding-top: 18px; margin-top: 23px; }\n.sr-app .sr-error-text { font-size: 12px; padding: 10px; border-left: 2px solid var(--sr-text); margin: 12px 0; background: var(--sr-soft); }\n.sr-app .sr-form-note { font-size: 11px; color: var(--sr-muted); }\n.sr-app .sr-history { margin: 20px 0; padding: 0; list-style: none; max-height: 350px; overflow-y: auto; }\n.sr-app .sr-history li { display: flex; align-items: center; gap: 13px; padding: 12px 0; border-bottom: 1px solid var(--sr-border); }\n.sr-app .sr-history-number { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; background: var(--sr-soft); border-radius: 50%; font-size: 11px; }\n.sr-app .sr-history li > div { flex: 1; }\n.sr-app .sr-history strong { display: block; font-size: 12px; font-weight: 550; }\n.sr-app .sr-history time { display: block; color: var(--sr-muted); font-size: 10px; margin-top: 3px; }\n.sr-app .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }\n@keyframes sr-spin { to { transform: rotate(360deg); } }\n@media (max-width: 1250px) {\n  .sr-app .sr-main { padding: 25px 20px 40px; }\n  .sr-app .sr-workspace { gap: 16px; grid-template-columns: minmax(0, 1fr) 290px; }\n  .sr-app .sr-repair-panel { padding: 19px; }\n  .sr-app .sr-board-count { display: none; }\n  .sr-app .sr-board-bottom { align-items: flex-start; flex-direction: column; }\n  .sr-app .sr-demo-note { align-items: flex-start; flex-wrap: wrap; }\n  .sr-app .sr-demo-note > .sr-button { margin-left: 42px; }\n}\n@media (max-width: 1040px) {\n  .sr-app .sr-workspace { grid-template-columns: minmax(0, 1fr); }\n  .sr-app .sr-repair-panel { position: static; }\n  .sr-app .sr-panel-illustration { float: right; margin: 0 12px 12px 25px; }\n  .sr-app .sr-panel-eyebrow { margin-bottom: 16px; }\n  .sr-app .sr-explainer { grid-template-columns: 20px 1fr; max-width: 650px; }\n  .sr-app .sr-diff-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; }\n}\n@media (max-width: 650px) {\n  .sr-app .sr-header { padding: 16px; }\n  .sr-app .sr-brand span { font-size: 10px; }\n  .sr-app .sr-environment { display: none; }\n  .sr-app .sr-main { padding: 22px 12px 40px; }\n  .sr-app .sr-heading-row { align-items: flex-start; flex-direction: column; gap: 17px; }\n  .sr-app .sr-heading-actions { width: 100%; }\n  .sr-app .sr-heading-actions .sr-button:last-child { flex: 1; }\n  .sr-app .sr-board-toolbar { padding: 0 12px; }\n  .sr-app .sr-tabs { gap: 18px; }\n  .sr-app .sr-tabs button { font-size: 11px; }\n  .sr-app .sr-view-bar { align-items: flex-start; flex-direction: column; gap: 8px; padding: 12px; }\n  .sr-app .sr-table-footer { align-items: flex-start; flex-direction: column; gap: 9px; padding: 12px; }\n  .sr-app .sr-table-footer > span { font-size: 9px; }\n  .sr-app .sr-empty { margin: 25px auto; padding: 15px 8px; }\n  .sr-app .sr-empty > p { font-size: 12px; }\n  .sr-app .sr-empty-art { margin-bottom: 30px; }\n  .sr-app .sr-empty-actions { flex-direction: column; width: 100%; }\n  .sr-app .sr-empty-actions .sr-button { width: 100%; }\n  .sr-app .sr-empty .sr-caption { max-width: 260px; }\n  .sr-app .sr-banner { flex-wrap: wrap; }\n  .sr-app .sr-banner p { flex-basis: 75%; }\n  .sr-app .sr-diff-list { grid-template-columns: 1fr; }\n  .sr-app .sr-modal { padding: 20px; }\n  .sr-app .sr-day-options { gap: 4px; }\n}\n@media (prefers-reduced-motion: reduce) { .sr-app *, .sr-app *::before, .sr-app *::after { animation-duration: 0s !important; transition-duration: 0s !important; } }\n';

// src/useBoard.ts
import { useCallback, useEffect as useEffect2, useRef as useRef2, useState as useState2 } from "react";
function useBoard({ rest, getScopeKey, subscribe: subscribe2 }) {
  const [board, setBoard] = useState2(null);
  const [loading, setLoading] = useState2(true);
  const [busy, setBusy] = useState2(null);
  const [error, setError] = useState2(null);
  const [connectionError, setConnectionError] = useState2(null);
  const [notice, setNotice] = useState2(null);
  const alive = useRef2(true);
  const operation = useRef2(false);
  const request = useRef2(0);
  const scope = useRef2(getScopeKey?.() ?? "local");
  const currentBoard = useRef2(null);
  const refresh = useCallback(async (quiet = false) => {
    if (operation.current) return;
    const nextScope = getScopeKey?.() ?? "local";
    if (scope.current !== nextScope) {
      scope.current = nextScope;
      currentBoard.current = null;
      setBoard(null);
      setNotice(null);
      setError(null);
      quiet = false;
    }
    const ticket = ++request.current;
    if (!quiet) setLoading(true);
    try {
      const response = await rest("/board");
      if (!alive.current || ticket !== request.current || nextScope !== (getScopeKey?.() ?? "local")) return;
      currentBoard.current = response.board;
      setBoard(response.board);
      setConnectionError(null);
    } catch (error2) {
      if (alive.current && ticket === request.current) setConnectionError(errorMessage(error2));
    } finally {
      if (alive.current && ticket === request.current) setLoading(false);
    }
  }, [rest, getScopeKey]);
  useEffect2(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(true), 3e3);
    const unsubscribe = subscribe2?.(() => void refresh(true));
    return () => {
      alive.current = false;
      ++request.current;
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [refresh, subscribe2]);
  const mutate = useCallback(async (path, body, action, success) => {
    if (operation.current) return false;
    const capturedScope = getScopeKey?.() ?? "local";
    if (capturedScope !== scope.current) {
      setError("The active Hermes connection changed. Review the current schedule before trying again.");
      await refresh();
      return false;
    }
    operation.current = true;
    ++request.current;
    setBusy(action);
    setLoading(false);
    setError(null);
    setNotice(null);
    let failure;
    try {
      const response = await rest(path, { method: "POST", body, timeoutMs: 3e4 });
      if (!alive.current || capturedScope !== (getScopeKey?.() ?? "local")) return false;
      currentBoard.current = response.board;
      setBoard(response.board);
      setConnectionError(null);
      if (success) setNotice(success);
      return true;
    } catch (caught) {
      failure = caught;
      return false;
    } finally {
      operation.current = false;
      if (alive.current) {
        setBusy(null);
        if (failure) {
          await refresh(true);
          setError(isStaleError(failure) ? "Someone changed this schedule while you were working. The current version is loaded. Review it, then try your change again." : errorMessage(failure));
        } else if (capturedScope !== (getScopeKey?.() ?? "local")) {
          await refresh();
        }
      }
    }
  }, [rest, getScopeKey, refresh]);
  return { board, loading, busy, error, connectionError, notice, refresh, mutate, setError, setNotice };
}

// src/App.tsx
import { Fragment as Fragment4, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function ShiftRepairApp(props) {
  const { board, loading, busy, error, connectionError, notice, refresh, mutate, setError, setNotice } = useBoard(props);
  const [tab, setTab] = useState3("schedule");
  const [view, setView] = useState3("proposal");
  const [modal, setModal] = useState3(null);
  const [exporting, setExporting] = useState3(false);
  const scheduleTab = useRef3(null);
  const availabilityTab = useRef3(null);
  const blocked = !!busy || exporting;
  const validCandidate = !!board?.candidate && board.candidate.base_revision === board.revision && isValidResult(board.candidate.result);
  const preview = validCandidate && view === "proposal";
  const changeTabWithKeyboard = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "schedule" : event.key === "End" ? "availability" : tab === "schedule" ? "availability" : "schedule";
    setTab(next);
    (next === "schedule" ? scheduleTab : availabilityTab).current?.focus();
  };
  const change = async (changes) => {
    if (!board) return false;
    return mutate("/changes", { expected_revision: board.revision, changes }, "Saving rules", "Rules saved. Find a repair to check the updated schedule.");
  };
  const solve = async () => {
    if (!board) return;
    if (await mutate("/solve", { expected_revision: board.revision }, "Finding a repair")) {
      setView("proposal");
      setTab("schedule");
    }
  };
  const loadDemo = async () => {
    if (await mutate("/demo", {}, "Loading example", "Example loaded. Try marking Asha unavailable on Monday.")) {
      setTab("schedule");
      setView("proposal");
      setModal(null);
    }
  };
  const download = async (kind) => {
    if (blocked) return;
    const scope = props.getScopeKey?.();
    setExporting(true);
    setError(null);
    try {
      const file = await props.rest(kind === "project" ? "/export?kind=project" : "/export");
      if (scope !== props.getScopeKey?.()) throw new Error("The active connection changed. Download again from the current board.");
      const result = await props.saveFile(file);
      if (result === "saved") setNotice(kind === "project" ? "Project CSV exported with people, availability and rules." : "Current schedule exported as CSV.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setExporting(false);
    }
  };
  return /* @__PURE__ */ jsx7(ModalContext.Provider, { value: props.dialog, children: /* @__PURE__ */ jsxs7("div", { className: "sr-app", children: [
    /* @__PURE__ */ jsx7("style", { children: styles_default }),
    /* @__PURE__ */ jsxs7("header", { className: "sr-header", children: [
      /* @__PURE__ */ jsxs7("div", { className: "sr-brand", children: [
        /* @__PURE__ */ jsxs7("div", { className: "sr-mark", "aria-hidden": "true", children: [
          /* @__PURE__ */ jsx7("span", {}),
          /* @__PURE__ */ jsx7("span", {}),
          /* @__PURE__ */ jsx7("span", {}),
          /* @__PURE__ */ jsx7("span", {})
        ] }),
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsx7("strong", { children: "ShiftRepair" }),
          /* @__PURE__ */ jsx7("span", { children: "Small changes. A workable week." })
        ] })
      ] }),
      /* @__PURE__ */ jsxs7("div", { className: "sr-header-meta", children: [
        /* @__PURE__ */ jsx7("span", { className: "sr-environment", children: props.mode === "desktop" ? "Hermes plugin" : "Local preview" }),
        /* @__PURE__ */ jsx7("button", { type: "button", className: "sr-icon-button", "aria-label": "Refresh schedule", disabled: blocked || loading, onClick: () => void refresh(), children: /* @__PURE__ */ jsx7(Icon, { name: "refresh" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs7("main", { className: "sr-main", children: [
      (error || connectionError) && /* @__PURE__ */ jsxs7("div", { className: "sr-banner sr-banner-error", role: "alert", children: [
        /* @__PURE__ */ jsx7(Icon, { name: "alert" }),
        /* @__PURE__ */ jsx7("p", { children: error || `Connection problem. ${connectionError}` }),
        /* @__PURE__ */ jsx7("button", { type: "button", className: "sr-button sr-button-subtle", disabled: blocked, onClick: () => {
          setError(null);
          void refresh();
        }, children: "Refresh" }),
        error && /* @__PURE__ */ jsx7("button", { type: "button", className: "sr-icon-button", onClick: () => setError(null), "aria-label": "Dismiss error", children: /* @__PURE__ */ jsx7(Icon, { name: "close", width: "16", height: "16" }) })
      ] }),
      notice && /* @__PURE__ */ jsxs7("div", { className: "sr-banner sr-banner-success", role: "status", children: [
        /* @__PURE__ */ jsx7(Icon, { name: "check" }),
        /* @__PURE__ */ jsx7("p", { children: notice }),
        /* @__PURE__ */ jsx7("button", { type: "button", className: "sr-icon-button", onClick: () => setNotice(null), "aria-label": "Dismiss notice", children: /* @__PURE__ */ jsx7(Icon, { name: "close", width: "16", height: "16" }) })
      ] }),
      loading && !board ? /* @__PURE__ */ jsxs7("section", { className: "sr-empty", role: "status", children: [
        /* @__PURE__ */ jsx7("div", { className: "sr-spinner" }),
        /* @__PURE__ */ jsx7("h1", { children: "Opening your schedule" }),
        /* @__PURE__ */ jsx7("p", { children: "Reading the current board from the ShiftRepair backend." })
      ] }) : !board ? /* @__PURE__ */ jsxs7("section", { className: "sr-empty", children: [
        /* @__PURE__ */ jsxs7("div", { className: "sr-empty-art", "aria-hidden": "true", children: [
          /* @__PURE__ */ jsx7("div", {}),
          /* @__PURE__ */ jsx7("div", {}),
          /* @__PURE__ */ jsx7("div", {}),
          /* @__PURE__ */ jsx7("div", {}),
          /* @__PURE__ */ jsx7("div", {}),
          /* @__PURE__ */ jsx7("div", {}),
          /* @__PURE__ */ jsx7("div", { className: "sr-empty-art-active", children: /* @__PURE__ */ jsx7(Icon, { name: "repair", width: "32", height: "32" }) }),
          /* @__PURE__ */ jsx7("div", {}),
          /* @__PURE__ */ jsx7("div", {})
        ] }),
        /* @__PURE__ */ jsx7("span", { className: "sr-eyebrow", children: "A last-minute absence. A smaller repair." }),
        /* @__PURE__ */ jsx7("h1", { children: "Keep the rest of the week intact." }),
        /* @__PURE__ */ jsx7("p", { children: "When staffing changes, ShiftRepair finds a valid schedule with the fewest assignment changes it can prove. You review the difference before applying it." }),
        /* @__PURE__ */ jsxs7("div", { className: "sr-empty-actions", children: [
          /* @__PURE__ */ jsxs7("button", { type: "button", className: "sr-button sr-button-primary", onClick: () => void loadDemo(), disabled: blocked, children: [
            /* @__PURE__ */ jsx7(Icon, { name: "calendar" }),
            busy === "Loading example" ? "Loading example\u2026" : "Open the example week"
          ] }),
          /* @__PURE__ */ jsxs7("button", { type: "button", className: "sr-button", disabled: blocked, onClick: () => setModal("import"), children: [
            /* @__PURE__ */ jsx7(Icon, { name: "upload" }),
            "Import project CSV"
          ] })
        ] }),
        /* @__PURE__ */ jsx7("span", { className: "sr-caption", children: "8 people \xB7 28 positions \xB7 a real constraint solver \xB7 no model API key needed" })
      ] }) : /* @__PURE__ */ jsxs7(Fragment4, { children: [
        /* @__PURE__ */ jsxs7("section", { className: "sr-heading-row", children: [
          /* @__PURE__ */ jsxs7("div", { children: [
            /* @__PURE__ */ jsx7("span", { className: "sr-eyebrow", children: "Weekly staffing" }),
            /* @__PURE__ */ jsx7("h1", { children: board.roster.name }),
            /* @__PURE__ */ jsxs7("p", { children: [
              /* @__PURE__ */ jsx7(Icon, { name: "calendar", width: "16", height: "16" }),
              weekLabel(board.roster.week_start),
              /* @__PURE__ */ jsx7("span", { className: "sr-separator", children: "/" }),
              /* @__PURE__ */ jsxs7("button", { type: "button", className: "sr-revision", onClick: () => setModal("history"), children: [
                "Revision ",
                board.revision,
                /* @__PURE__ */ jsx7(Icon, { name: "chevron", width: "12", height: "12" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "sr-heading-actions", children: [
            /* @__PURE__ */ jsxs7("button", { type: "button", className: "sr-button", onClick: () => void mutate("/undo", { expected_revision: board.revision }, "Restoring revision", "Previous content restored as a new revision."), disabled: blocked || board.history.length < 2, children: [
              /* @__PURE__ */ jsx7(Icon, { name: "undo", width: "16", height: "16" }),
              "Undo"
            ] }),
            /* @__PURE__ */ jsxs7("button", { type: "button", className: "sr-button", onClick: () => void download("schedule"), disabled: blocked || board.validation.length > 0, title: board.validation.length ? "Repair the current schedule before exporting" : "Download the current schedule, not the unaccepted proposal", children: [
              /* @__PURE__ */ jsx7(Icon, { name: "download", width: "16", height: "16" }),
              exporting ? "Exporting\u2026" : "Export schedule"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "sr-workspace", children: [
          /* @__PURE__ */ jsxs7("div", { className: "sr-board-column", children: [
            /* @__PURE__ */ jsxs7("section", { className: "sr-board-card", children: [
              /* @__PURE__ */ jsxs7("div", { className: "sr-board-toolbar", children: [
                /* @__PURE__ */ jsxs7("div", { className: "sr-tabs", role: "tablist", "aria-label": "Schedule and team rules", children: [
                  /* @__PURE__ */ jsxs7("button", { ref: scheduleTab, type: "button", role: "tab", tabIndex: tab === "schedule" ? 0 : -1, "aria-selected": tab === "schedule", "aria-controls": "sr-schedule-panel", id: "sr-schedule-tab", onKeyDown: changeTabWithKeyboard, onClick: () => setTab("schedule"), children: [
                    /* @__PURE__ */ jsx7(Icon, { name: "calendar", width: "16", height: "16" }),
                    "Schedule"
                  ] }),
                  /* @__PURE__ */ jsxs7("button", { ref: availabilityTab, type: "button", role: "tab", tabIndex: tab === "availability" ? 0 : -1, "aria-selected": tab === "availability", "aria-controls": "sr-availability-panel", id: "sr-availability-tab", onKeyDown: changeTabWithKeyboard, onClick: () => setTab("availability"), children: [
                    /* @__PURE__ */ jsx7(Icon, { name: "people", width: "16", height: "16" }),
                    "Availability & limits"
                  ] })
                ] }),
                /* @__PURE__ */ jsxs7("span", { className: "sr-board-count", children: [
                  board.roster.people.length,
                  " people \xB7 ",
                  board.roster.slots.length,
                  " positions"
                ] })
              ] }),
              /* @__PURE__ */ jsxs7("div", { className: "sr-view-bar", children: [
                /* @__PURE__ */ jsx7("p", { children: tab === "availability" ? "Select a day to change availability. Set each person's weekly limit." : preview ? "Proposed schedule. Highlighted positions change when you apply." : "Current schedule. Lock an assignment to keep that person in place." }),
                validCandidate && tab === "schedule" && /* @__PURE__ */ jsxs7("div", { className: "sr-segmented", role: "group", "aria-label": "Schedule version", children: [
                  /* @__PURE__ */ jsx7("button", { type: "button", "aria-pressed": view === "current", onClick: () => setView("current"), children: "Current" }),
                  /* @__PURE__ */ jsx7("button", { type: "button", "aria-pressed": view === "proposal", onClick: () => setView("proposal"), children: "Proposal" })
                ] })
              ] }),
              tab === "schedule" ? /* @__PURE__ */ jsxs7("div", { role: "tabpanel", id: "sr-schedule-panel", "aria-labelledby": "sr-schedule-tab", children: [
                /* @__PURE__ */ jsx7(Schedule, { board, preview, busy: blocked, change: (changes) => void change(changes) }),
                /* @__PURE__ */ jsxs7("div", { className: "sr-table-footer", children: [
                  /* @__PURE__ */ jsxs7("div", { className: "sr-legend", children: [
                    /* @__PURE__ */ jsxs7("span", { children: [
                      /* @__PURE__ */ jsx7("i", { className: "sr-legend-change" }),
                      "Proposed change"
                    ] }),
                    /* @__PURE__ */ jsxs7("span", { children: [
                      /* @__PURE__ */ jsx7("i", { className: "sr-legend-issue" }),
                      "Needs attention"
                    ] }),
                    /* @__PURE__ */ jsxs7("span", { children: [
                      /* @__PURE__ */ jsx7(Icon, { name: "lock", width: "12", height: "12" }),
                      "Locked"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx7("span", { children: connectionError ? "Connection interrupted" : "Refreshes every 3 seconds" })
                ] })
              ] }) : /* @__PURE__ */ jsx7("div", { role: "tabpanel", id: "sr-availability-panel", "aria-labelledby": "sr-availability-tab", children: /* @__PURE__ */ jsx7(Availability, { board, busy: blocked, change: (changes) => void change(changes), addPerson: () => setModal("cover") }) })
            ] }),
            /* @__PURE__ */ jsxs7("section", { className: "sr-rules-card", "aria-labelledby": "sr-rules-title", children: [
              /* @__PURE__ */ jsxs7("div", { className: "sr-rules-title", children: [
                /* @__PURE__ */ jsx7(Icon, { name: "check", width: "16", height: "16" }),
                /* @__PURE__ */ jsx7("h2", { id: "sr-rules-title", children: "Rules every repair must satisfy" })
              ] }),
              /* @__PURE__ */ jsxs7("div", { className: "sr-rules", children: [
                /* @__PURE__ */ jsx7("span", { children: "Every position filled" }),
                /* @__PURE__ */ jsx7("span", { children: "Qualified people only" }),
                /* @__PURE__ */ jsx7("span", { children: "Available days only" }),
                /* @__PURE__ */ jsx7("span", { children: "One assignment per person per day" }),
                /* @__PURE__ */ jsx7("span", { children: "Weekly limits respected" }),
                /* @__PURE__ */ jsxs7("span", { children: [
                  Object.keys(board.roster.pins).length,
                  " locked ",
                  Object.keys(board.roster.pins).length === 1 ? "position" : "positions"
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("section", { className: "sr-demo-note", children: [
              /* @__PURE__ */ jsx7("span", { className: "sr-demo-note-icon", children: /* @__PURE__ */ jsx7(Icon, { name: "repair" }) }),
              /* @__PURE__ */ jsxs7("div", { children: [
                /* @__PURE__ */ jsx7("strong", { children: "Try a disruption" }),
                /* @__PURE__ */ jsxs7("p", { children: [
                  "Open Availability & limits and mark ",
                  board.roster.people.some((person) => person.id === "asha") ? "Asha unavailable on Monday" : "a scheduled person unavailable",
                  ". Find a repair and inspect exactly who moves."
                ] })
              ] }),
              /* @__PURE__ */ jsxs7("button", { type: "button", className: "sr-button sr-button-subtle", onClick: () => setTab("availability"), children: [
                "Edit availability",
                /* @__PURE__ */ jsx7(Icon, { name: "arrow", width: "15", height: "15" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("footer", { className: "sr-board-bottom", children: [
              /* @__PURE__ */ jsxs7("div", { children: [
                /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => setModal("import"), disabled: blocked, children: "Import project CSV" }),
                /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => void download("project"), disabled: blocked || board.validation.length > 0, title: board.validation.length ? "Repair the current schedule before exporting" : "Download the full current project with people and rules", children: "Export project data" }),
                /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => setModal("reset"), disabled: blocked, children: "Reset example" })
              ] }),
              /* @__PURE__ */ jsx7("span", { children: "Explicit changes \xB7 reversible revisions" })
            ] })
          ] }),
          /* @__PURE__ */ jsx7(RepairPanel, { board, busy, solve: () => void solve(), apply: () => {
            if (board.candidate) void mutate("/apply", { expected_revision: board.revision, candidate_id: board.candidate.id }, "Applying repair", "Repair applied. The current schedule is updated and checked.");
          }, discard: () => {
            if (board.candidate) void mutate("/discard", { expected_revision: board.revision, candidate_id: board.candidate.id }, "Discarding proposal", "Proposal discarded. The current schedule is unchanged.");
          }, addPerson: () => setModal("cover") })
        ] })
      ] }),
      busy && busy !== "Finding a repair" && /* @__PURE__ */ jsxs7("div", { className: "sr-operation", role: "status", children: [
        /* @__PURE__ */ jsx7("div", { className: "sr-spinner" }),
        busy,
        "\u2026"
      ] })
    ] }),
    modal === "reset" && /* @__PURE__ */ jsxs7(Modal, { title: "Reset to the example week?", onClose: () => setModal(null), children: [
      /* @__PURE__ */ jsx7("p", { className: "sr-form-intro", children: "This replaces the current people, rules and assignments with the original example. The reset creates a revision you can undo. Export project data if you also want a portable copy." }),
      /* @__PURE__ */ jsxs7("div", { className: "sr-modal-actions", children: [
        /* @__PURE__ */ jsx7("button", { type: "button", className: "sr-button", disabled: blocked, onClick: () => setModal(null), children: "Cancel" }),
        /* @__PURE__ */ jsx7("button", { type: "button", className: "sr-button sr-button-primary", disabled: blocked, onClick: () => void loadDemo(), children: "Reset example" })
      ] })
    ] }),
    modal === "cover" && board && /* @__PURE__ */ jsx7(CoverForm, { board, busy: blocked, requestError: error, onClose: () => setModal(null), onAdd: (person) => change([{ type: "add_person", person }]) }),
    modal === "import" && /* @__PURE__ */ jsx7(ImportForm, { board, busy: blocked, mode: props.mode, requestError: error, onClose: () => setModal(null), onImport: (content) => mutate("/import", { content, ...board ? { expected_revision: board.revision } : {} }, "Importing project", "Project imported. The current schedule has been checked.") }),
    modal === "history" && board && /* @__PURE__ */ jsxs7(Modal, { title: "Revision history", onClose: () => setModal(null), children: [
      /* @__PURE__ */ jsx7("p", { className: "sr-form-intro", children: "Changes create new revisions. Undo restores prior content while keeping this history." }),
      /* @__PURE__ */ jsx7("ol", { className: "sr-history", children: [...board.history].reverse().map((entry) => /* @__PURE__ */ jsxs7("li", { children: [
        /* @__PURE__ */ jsx7("span", { className: "sr-history-number", children: entry.revision }),
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsx7("strong", { children: actionLabel(entry.action) }),
          /* @__PURE__ */ jsx7("time", { dateTime: entry.created_at, children: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at)) })
        ] }),
        entry.revision === board.revision && /* @__PURE__ */ jsx7("span", { className: "sr-status-badge", children: "Current" })
      ] }, entry.revision)) }),
      /* @__PURE__ */ jsx7("div", { className: "sr-modal-actions", children: /* @__PURE__ */ jsx7("button", { type: "button", className: "sr-button", onClick: () => setModal(null), children: "Done" }) })
    ] })
  ] }) });
}

// src/plugin.tsx
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
function NativeDialog({ title, children, onClose }) {
  return /* @__PURE__ */ jsx8(Dialog, { open: true, onOpenChange: (open) => {
    if (!open) onClose();
  }, children: /* @__PURE__ */ jsx8(DialogContent, { showCloseButton: false, fitContent: true, children: /* @__PURE__ */ jsxs8("div", { className: "sr-app", children: [
    /* @__PURE__ */ jsx8("style", { children: styles_default }),
    /* @__PURE__ */ jsxs8("div", { className: "sr-native-modal", children: [
      /* @__PURE__ */ jsxs8("div", { className: "sr-modal-heading", children: [
        /* @__PURE__ */ jsx8(DialogTitle, { children: title }),
        /* @__PURE__ */ jsx8("button", { type: "button", className: "sr-icon-button", "aria-label": "Close dialog", onClick: onClose, children: /* @__PURE__ */ jsx8(Icon, { name: "close" }) })
      ] }),
      /* @__PURE__ */ jsx8(DialogDescription, { className: "sr-only", children: "Review the current ShiftRepair board and submit the changes below." }),
      children
    ] })
  ] }) }) });
}
var scopeKey = () => `${host.state.profile.get()}:${gatewayActivationEpoch()}`;
var subscribe = (refresh) => host.onEvent("plugin.shiftrepair.board.updated", refresh);
function NativeApp({ rest, saveFile }) {
  const profile = useValue(host.state.profile);
  const epoch = useGatewayActivationEpoch();
  return /* @__PURE__ */ jsx8(ShiftRepairApp, { rest, saveFile, mode: "desktop", getScopeKey: scopeKey, subscribe, dialog: NativeDialog }, `${profile}:${epoch}`);
}
async function saveNativeFile(ctx, file) {
  if (!ctx.files?.requestFolder || !ctx.files?.writeText) throw new Error("This Hermes Desktop version does not expose the plugin file save API. Update Desktop or export through the local preview.");
  const result = await ctx.files.requestFolder();
  if (!result.ok) {
    if (result.error === "cancelled" || result.error === "canceled") return "cancelled";
    throw new Error(result.message);
  }
  if (!result.folder) return "cancelled";
  const basename = file.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "shiftrepair.csv";
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[^0-9]/g, "");
  const filename = `${basename.replace(/\.csv$/i, "")}-${stamp}.csv`;
  const written = await ctx.files.writeText(result.folder.id, filename, file.content, { exclusive: true });
  if (!written.ok) throw new Error(written.message);
  return "saved";
}
var plugin_default = {
  id: "shiftrepair",
  name: "ShiftRepair",
  register(ctx) {
    const rest = async (path, options) => {
      try {
        return await ctx.rest(path, options);
      } catch (error) {
        throw normalizeSdkError(error);
      }
    };
    const saveFile = (file) => saveNativeFile(ctx, file);
    ctx.registerMany([
      { id: "page", area: ROUTES_AREA, data: { path: "/shiftrepair" }, render: () => /* @__PURE__ */ jsx8(NativeApp, { rest, saveFile }) },
      { id: "nav", area: SIDEBAR_NAV_AREA, data: { path: "/shiftrepair", label: "ShiftRepair", codicon: "calendar" } }
    ]);
  }
};
export {
  plugin_default as default
};
