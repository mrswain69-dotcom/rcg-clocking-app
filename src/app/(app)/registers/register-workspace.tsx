"use client";
import { useState, type ReactNode } from "react";
import { AttendanceEditor } from "./attendance-editor";
import type { RosterRow } from "@/lib/registers";
export function RegisterWorkspace({
  sessionId,
  revision,
  rows,
  confirmed,
  canEdit,
  children,
}: {
  sessionId: string;
  revision: number;
  rows: RosterRow[];
  confirmed: boolean;
  canEdit: boolean;
  children: ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  return (
    <div
      className="space-y-6"
      onSubmitCapture={(event) => {
        if (dirty) event.preventDefault();
      }}
    >
      <AttendanceEditor
        sessionId={sessionId}
        revision={revision}
        rows={rows}
        confirmed={confirmed}
        canEdit={canEdit}
        onDirtyChange={setDirty}
      />
      {dirty ? (
        <p role="status">
          Save your changes before confirming or sending notifications.
        </p>
      ) : (
        children
      )}
    </div>
  );
}
