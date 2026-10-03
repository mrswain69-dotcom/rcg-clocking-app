import type { AppProfile } from "@/lib/auth";
export function isRegisterManager(profile: AppProfile) {
  return (
    profile.role === "owner" ||
    (profile.role === "admin" && profile.can_manage_registers)
  );
}
export type RegisterSession = {
  id: string;
  name: string;
  external_label: string;
  starts_at: string;
  ends_at: string;
  kind: string;
  status: string;
  revision: number;
  confirmed_at: string | null;
};
export type RosterRow = {
  client_id: string;
  display_name: string;
  status: string;
  arrived_at: string | null;
  departed_at: string | null;
};
export type RegisterReportRow = {
  session_id: string;
  client_id: string;
  display_name: string;
  session_name: string;
  starts_at: string;
  ends_at: string;
  session_status: string;
  attendance_status: string;
  arrived_at: string | null;
  departed_at: string | null;
};
export function summariseRegisterAttendance(rows: RegisterReportRow[]) {
  const summary = new Map<
    string,
    {
      client_id: string;
      display_name: string;
      attended: number;
      missed: number;
      excused: number;
      pending: number;
    }
  >();
  for (const row of rows) {
    if (row.session_status === "cancelled") continue;
    const item = summary.get(row.client_id) ?? {
      client_id: row.client_id,
      display_name: row.display_name,
      attended: 0,
      missed: 0,
      excused: 0,
      pending: 0,
    };
    if (
      row.session_status !== "confirmed" ||
      row.attendance_status === "unmarked"
    )
      item.pending++;
    else if (["present", "late"].includes(row.attendance_status))
      item.attended++;
    else if (row.attendance_status === "absent") item.missed++;
    else if (row.attendance_status === "excused") item.excused++;
    summary.set(row.client_id, item);
  }
  return [...summary.values()].sort((a, b) =>
    a.display_name.localeCompare(b.display_name),
  );
}
