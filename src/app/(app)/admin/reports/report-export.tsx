"use client";

type ReportRow = {
  id: string;
  profile_id: string;
  full_name: string;
  email: string;
  profile_type: string;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_method: string;
  clock_out_method: string | null;
  notes: string | null;
  hours: number;
  clock_in_location_status: string | null;
  clock_in_distance_m: number | null;
  clock_in_accuracy_m: number | null;
  first_on_site_verified_at: string | null;
  first_on_site_verification_method: string | null;
  last_presence_check_at: string | null;
  location_label: string;
  location_detail: string;
  arrival_delay_minutes: number | null;
};

type SummaryRow = {
  profile_id: string;
  full_name: string;
  email: string;
  profile_type: string;
  visits: number;
  hours: number;
};

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function download(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ReportExports({ rows, summary, from, to }: { rows: ReportRow[]; summary: SummaryRow[]; from: string; to: string }) {
  const suffix = `${from}_to_${to}`;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="btn btn-secondary"
        type="button"
        disabled={!rows.length}
        onClick={() => download(`rcg-hours-detail-${suffix}.csv`, [
          [
            "Name",
            "Email",
            "Clock in",
            "Clock out",
            "Hours",
            "Clock in method",
            "Clock out method",
            "Location status",
            "Distance outside site (m)",
            "GPS accuracy (m)",
            "First verified on site",
            "Arrival delay (minutes)",
            "First on-site verification method",
            "Last presence check",
            "Notes",
          ],
          ...rows.map((row) => [
            row.full_name,
            row.email,
            row.clock_in_at,
            row.clock_out_at ?? "",
            row.hours.toFixed(2),
            row.clock_in_method,
            row.clock_out_method ?? "",
            row.location_label,
            row.clock_in_distance_m ?? "",
            row.clock_in_accuracy_m ?? "",
            row.first_on_site_verified_at ?? "",
            row.arrival_delay_minutes ?? "",
            row.first_on_site_verification_method ?? "",
            row.last_presence_check_at ?? "",
            row.notes ?? "",
          ]),
        ])}
      >
        Export detailed CSV
      </button>
      <button
        className="btn btn-secondary"
        type="button"
        disabled={!summary.length}
        onClick={() => download(`rcg-hours-summary-${suffix}.csv`, [
          ["Name", "Email / type", "Visits", "Hours"],
          ...summary.map((row) => [
            row.full_name,
            row.profile_type === "attendance_only" ? "Attendance only · no login" : row.email,
            row.visits,
            row.hours.toFixed(2),
          ]),
        ])}
      >
        Export summary CSV
      </button>
    </div>
  );
}
