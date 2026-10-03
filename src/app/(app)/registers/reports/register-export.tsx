"use client";
import type { RegisterReportRow } from "@/lib/registers";
export function RegisterExport({
  rows,
  from,
  to,
}: {
  rows: RegisterReportRow[];
  from: string;
  to: string;
}) {
  function download() {
    const values = [
      [
        "Client reference",
        "Name",
        "Session",
        "Scheduled start",
        "Scheduled end",
        "Register status",
        "Attendance status",
        "Observed arrival",
        "Observed departure",
      ],
      ...rows.map((r) => [
        r.client_id,
        r.display_name,
        r.session_name,
        r.starts_at,
        r.ends_at,
        r.session_status,
        r.attendance_status,
        r.arrived_at ?? "",
        r.departed_at ?? "",
      ]),
    ];
    const csv = values
      .map((row) =>
        row
          .map(
            (value) =>
              `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`,
          )
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `rcg-register-${from}_to_${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button
      className="btn btn-secondary"
      type="button"
      disabled={!rows.length}
      onClick={download}
    >
      Export attendance CSV
    </button>
  );
}
