"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAttendance, type AttendanceInput } from "./actions";
import { londonDateTimeLocalValue } from "@/lib/dates";
import type { RosterRow } from "@/lib/registers";
export function AttendanceEditor({
  sessionId,
  revision,
  rows,
  confirmed,
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
  const router = useRouter();
  const [values, setValues] = useState<AttendanceInput[]>(() =>
    rows.map((row) => ({
      client_id: row.client_id,
      status: row.status,
      arrived_at: row.arrived_at
        ? londonDateTimeLocalValue(new Date(row.arrived_at))
        : "",
      departed_at: row.departed_at
        ? londonDateTimeLocalValue(new Date(row.departed_at))
        : "",
    })),
  );
  const [editingRevision, setEditingRevision] = useState(revision);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (dirty || revision < editingRevision) return;
    setValues(
      rows.map((row) => ({
        client_id: row.client_id,
        status: row.status,
        arrived_at: row.arrived_at
          ? londonDateTimeLocalValue(new Date(row.arrived_at))
          : "",
        departed_at: row.departed_at
          ? londonDateTimeLocalValue(new Date(row.departed_at))
          : "",
      })),
    );
    setEditingRevision(revision);
  }, [rows, revision, dirty, editingRevision]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(clientId: string, key: keyof AttendanceInput, value: string) {
    setValues((old) =>
      old.map((row) =>
        row.client_id === clientId ? { ...row, [key]: value } : row,
      ),
    );
    setDirty(true);
    onDirtyChange(true);
    setMessage(null);
  }
  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await saveAttendance(sessionId, editingRevision, values, reason);
      setEditingRevision(editingRevision + 1);
      setDirty(false);
      onDirtyChange(false);
      setMessage(
        "Attendance saved. No emails sent. Review recipients and confirm below.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save attendance.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card p-5">
      <h2 className="text-2xl font-black">Take the register</h2>
      <p className="mt-2">
        Record what you observed. Arrival and departure times are optional and
        separate from the scheduled session times. All times below are UK time.
      </p>
      <div className="table-wrap mt-4">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Status</th>
              <th>Observed arrival</th>
              <th>Observed departure</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.client_id}>
                <td>
                  <strong>{row.display_name}</strong>
                  <div className="text-xs">Ref {row.client_id.slice(0, 8)}</div>
                </td>
                <td>
                  <select
                    className="input"
                    disabled={!canEdit || busy}
                    value={
                      values.find((v) => v.client_id === row.client_id)
                        ?.status ?? row.status
                    }
                    onChange={(e) =>
                      change(row.client_id, "status", e.target.value)
                    }
                  >
                    {["unmarked", "present", "late", "absent", "excused"].map(
                      (s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ),
                    )}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Arrival for ${row.display_name}`}
                    className="input"
                    type="datetime-local"
                    value={
                      values.find((v) => v.client_id === row.client_id)
                        ?.arrived_at ?? ""
                    }
                    disabled={
                      !canEdit ||
                      busy ||
                      !["present", "late"].includes(
                        values.find((v) => v.client_id === row.client_id)
                          ?.status ?? row.status,
                      )
                    }
                    onChange={(e) =>
                      change(row.client_id, "arrived_at", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`Departure for ${row.display_name}`}
                    className="input"
                    type="datetime-local"
                    value={
                      values.find((v) => v.client_id === row.client_id)
                        ?.departed_at ?? ""
                    }
                    disabled={
                      !canEdit ||
                      busy ||
                      !["present", "late"].includes(
                        values.find((v) => v.client_id === row.client_id)
                          ?.status ?? row.status,
                      )
                    }
                    onChange={(e) =>
                      change(row.client_id, "departed_at", e.target.value)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmed && canEdit ? (
        <label className="block mt-4">
          Correction reason
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </label>
      ) : null}
      {canEdit ? (
        <button
          className="btn btn-primary mt-4"
          type="button"
          disabled={busy || !dirty || (confirmed && !reason.trim())}
          onClick={() => void save()}
        >
          {busy
            ? "Saving…"
            : confirmed
              ? "Save correction for review"
              : "Save attendance draft"}
        </button>
      ) : null}
      {dirty ? (
        <p className="mt-2 font-bold">
          Unsaved changes. Save attendance before confirming the register.
        </p>
      ) : null}
      {message ? (
        <p className="mt-3" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
