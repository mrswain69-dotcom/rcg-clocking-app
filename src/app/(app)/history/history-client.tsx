"use client";

type Session = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_method: string;
  clock_out_method: string | null;
};

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function HistoryExport({ sessions }: { sessions: Session[] }) {
  function downloadCsv() {
    const rows = [
      ["Clock in", "Clock out", "Clock in method", "Clock out method"],
      ...sessions.map((session) => [
        session.clock_in_at,
        session.clock_out_at ?? "",
        session.clock_in_method,
        session.clock_out_method ?? "",
      ]),
    ];

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `rcg-hours-${today}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button className="btn-secondary" type="button" onClick={downloadCsv} disabled={!sessions.length}>
      Export CSV
    </button>
  );
}
