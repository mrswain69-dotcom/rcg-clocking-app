"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { recordLiveAttendance, type LiveAttendanceInput } from "./actions";
import { londonDateTimeLocalValue } from "@/lib/dates";
import type { RosterRow } from "@/lib/registers";
const inputRows = (rows: RosterRow[]): LiveAttendanceInput[] =>
  rows.map((r) => ({
    client_id: r.client_id,
    status: r.status === "late" ? "present" : r.status,
    arrived_at: r.arrived_at
      ? londonDateTimeLocalValue(new Date(r.arrived_at))
      : "",
    departed_at: r.departed_at
      ? londonDateTimeLocalValue(new Date(r.departed_at))
      : "",
    marked_at: r.marked_at
      ? londonDateTimeLocalValue(new Date(r.marked_at))
      : r.arrived_at
        ? londonDateTimeLocalValue(new Date(r.arrived_at))
        : "",
  }));
export function AttendanceEditor({
  sessionId,
  revision,
  rows,
  canEdit,
  onDirtyChange,
}: {
  sessionId: string;
  revision: number;
  rows: RosterRow[];
  confirmed: boolean;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [values, setValues] = useState(() => inputRows(rows));
  const [editingRevision, setEditingRevision] = useState(revision);
  const [busy, startTransition] = useTransition();
  const inFlight = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (!dirty && !inFlight.current && revision > editingRevision) {
      setValues(inputRows(rows));
      setEditingRevision(revision);
    }
  }, [rows, revision, editingRevision, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(id: string, key: keyof LiveAttendanceInput, value: string) {
    setValues((v) =>
      v.map((r) =>
        r.client_id === id
          ? {
              ...r,
              [key]: value,
              ...(key === "arrived_at" ? { marked_at: value } : {}),
            }
          : r,
      ),
    );
    setDirty(true);
    onDirtyChange(true);
    setMessage("");
  }
  function persist(
    next: LiveAttendanceInput[],
    changed: LiveAttendanceInput[],
    regenerate = false,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await recordLiveAttendance(
          sessionId,
          editingRevision,
          changed,
          regenerate,
        );
        setValues(next);
        setEditingRevision(result.revision);
        setDirty(false);
        onDirtyChange(false);
        setMessage(result.message);
      } catch (e) {
        setMessage(
          e instanceof Error
            ? e.message
            : "Unable to save. Your previous saved record is unchanged.",
        );
      } finally {
        inFlight.current = false;
      }
    });
  }
  function mark(id: string, status: string) {
    const now = londonDateTimeLocalValue();
    const next = values.map((r) =>
      r.client_id !== id
        ? r
        : r.status === status
          ? {
              ...r,
              status: "unmarked",
              marked_at: "",
              arrived_at: "",
              departed_at: "",
            }
          : {
              ...r,
              status,
              marked_at: status === "excused" ? "" : now,
              arrived_at: status === "present" ? now : "",
              departed_at: "",
            },
    );
    persist(
      next,
      next.filter((r) => r.client_id === id),
    );
  }
  function depart(ids: string[]) {
    const now = londonDateTimeLocalValue();
    const next = values.map((r) =>
      ids.includes(r.client_id) && r.status === "present"
        ? { ...r, departed_at: r.departed_at && ids.length === 1 ? "" : now }
        : r,
    );
    persist(
      next,
      next.filter((r) => ids.includes(r.client_id) && r.status === "present"),
    );
  }
  return (
    <section className="card p-5">
      <h2 className="text-2xl font-black">Take the register</h2>
      <p className="mt-2">
        Tap a status to save the current UK date and time and queue the selected
        contacts’ notifications. Tap again to clear it. Excused sends no
        notification. Edit times below, then save time changes.
      </p>
      <div className="table-wrap mt-4">
        <table className="register-taking-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Client</th>
              <th>Status</th>
              <th>Attendance time · UK</th>
              <th>Departure · UK</th>
            </tr>
          </thead>
          <tbody>
            {values.map((row) => {
              const name =
                rows.find((r) => r.client_id === row.client_id)?.display_name ??
                "";
              return (
                <tr key={row.client_id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${name} for notification regeneration`}
                      checked={selected.includes(row.client_id)}
                      onChange={(e) =>
                        setSelected((v) =>
                          e.target.checked
                            ? [...v, row.client_id]
                            : v.filter((id) => id !== row.client_id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <strong>{name}</strong>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      {[
                        { status: "present", icon: "✓", label: "Present" },
                        { status: "absent", icon: "○", label: "Absent" },
                        { status: "excused", icon: "−", label: "Excused" },
                      ].map((b) => (
                        <button
                          key={b.status}
                          type="button"
                          title={b.label}
                          aria-label={`${b.label}: ${name}`}
                          aria-pressed={row.status === b.status}
                          disabled={!canEdit || busy || dirty}
                          onClick={() => mark(row.client_id, b.status)}
                          className={`min-h-11 min-w-11 rounded-xl border text-xl font-bold ${row.status === b.status ? (b.status === "excused" ? "bg-blue-600 text-white border-blue-600" : "bg-green-700 text-white border-green-700") : "bg-slate-100 text-slate-600 border-slate-300"}`}
                        >
                          {b.icon}
                          <span className="sr-only">{b.label}</span>
                        </button>
                      ))}
                    </div>
                    <small className="block mt-1 capitalize">
                      {row.status}
                    </small>
                  </td>
                  <td>
                    <input
                      className="input disabled:opacity-40"
                      aria-label={`Attendance time for ${name}`}
                      type="datetime-local"
                      disabled={
                        !canEdit ||
                        busy ||
                        !["present", "absent"].includes(row.status)
                      }
                      value={
                        row.status === "present"
                          ? row.arrived_at
                          : row.marked_at
                      }
                      onChange={(e) =>
                        edit(
                          row.client_id,
                          row.status === "present" ? "arrived_at" : "marked_at",
                          e.target.value,
                        )
                      }
                    />
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        title={
                          row.departed_at
                            ? "Clear departure"
                            : "Record departure"
                        }
                        aria-label={`Departure: ${name}`}
                        aria-pressed={Boolean(row.departed_at)}
                        className={`min-h-11 min-w-11 rounded-xl border ${row.departed_at ? "bg-green-700 text-white" : "bg-slate-100 text-slate-600"}`}
                        disabled={
                          !canEdit || busy || dirty || row.status !== "present"
                        }
                        onClick={() => depart([row.client_id])}
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path d="M9 4H4v16h5M13 7l5 5-5 5M8 12h12" />
                        </svg>
                      </button>
                      <input
                        className="input disabled:opacity-40"
                        aria-label={`Departure time for ${name}`}
                        type="datetime-local"
                        disabled={!canEdit || busy || row.status !== "present"}
                        value={row.departed_at}
                        onChange={(e) =>
                          edit(row.client_id, "departed_at", e.target.value)
                        }
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={
              busy ||
              dirty ||
              !values.some((r) => r.status === "present" && !r.departed_at)
            }
            onClick={() =>
              depart(
                values
                  .filter((r) => r.status === "present" && !r.departed_at)
                  .map((r) => r.client_id),
              )
            }
          >
            Mark all present clients as departed
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !dirty}
            onClick={() => persist(values, values)}
          >
            Save time changes
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || dirty || !selected.length}
            onClick={() =>
              persist(
                values,
                values.filter((r) => selected.includes(r.client_id)),
                true,
              )
            }
          >
            Regenerate selected notifications
          </button>
        </div>
      ) : null}
      {dirty ? (
        <p className="mt-3 font-bold">
          Unsaved time changes. Save before using status or departure buttons.
        </p>
      ) : null}
      {message ? (
        <p className="mt-3" role="status">
          {message}
        </p>
      ) : null}
      {busy ? <p role="status">Saving…</p> : null}
    </section>
  );
}
