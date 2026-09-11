"use client";

type ReportRow = {
  id: string;
  full_name: string;
  email: string;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_method: string;
  clock_out_method: string | null;
  notes: string | null;
  hours: number;
};

type SummaryRow = {
  full_name: string;
  email: string;
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
          ["Name", "Email", "Clock in", "Clock out", "Hours", "Clock in method", "Clock out method", "Notes"],
          ...rows.map((row) => [row.full_name, row.email, row.clock_in_at, row.clock_out_at ?? "", row.hours.toFixed(2), row.clock_in_method, row.clock_out_method ?? "", row.notes ?? ""]),
        ])}
      >
        Export detailed CSV
      </button>
      <button
        className="btn btn-secondary"
        type="button"
        disabled={!summary.length}
        onClick={() => download(`rcg-hours-summary-${suffix}.csv`, [
          ["Name", "Email", "Visits", "Hours"],
          ...summary.map((row) => [row.full_name, row.email, row.visits, row.hours.toFixed(2)]),
        ])}
      >
        Export summary CSV
      </button>
    </div>
  );
}
