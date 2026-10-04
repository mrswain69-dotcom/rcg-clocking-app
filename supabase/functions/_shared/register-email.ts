export type AttendanceEmailPayload = {
  display_name: string;
  session: string;
  starts_at: string;
  ends_at: string;
  status: string;
  arrived_at: string | null;
  departed_at: string | null;
  recorded_at: string;
  correction: boolean;
};
function ukTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function registerEmail(payload: AttendanceEmailPayload) {
  const status = ["present", "late"].includes(payload.status)
    ? `${payload.display_name} was recorded as ${payload.status}${payload.arrived_at ? ` at ${ukTime(payload.arrived_at)}` : ` (recorded ${ukTime(payload.recorded_at)})`}.`
    : `${payload.display_name} was recorded as ${payload.status} for this session.`;
  return {
    subject: payload.correction
      ? "RCG attendance correction"
      : "RCG attendance update",
    text: [
      payload.correction
        ? "This corrects an earlier attendance record."
        : "Attendance update from Redcatch Community Garden.",
      status,
      `Session: ${payload.session}`,
      `Scheduled: ${ukTime(payload.starts_at)} to ${ukTime(payload.ends_at)}`,
      payload.departed_at
        ? `Observed departure: ${ukTime(payload.departed_at)}`
        : "",
      "This is a saved attendance record, not a live location confirmation.",
      "If you received this in error, please contact Redcatch Community Garden and do not forward the message.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
