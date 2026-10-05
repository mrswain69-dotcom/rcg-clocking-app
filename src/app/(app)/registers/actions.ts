"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { londonLocalInputToIso } from "@/lib/dates";

export async function registerAction(form: FormData) {
  const { supabase } = await requireProfile();
  const action = String(form.get("action") ?? "");
  const data: Record<string, unknown> = Object.fromEntries(form.entries());
  const sessionId = String(form.get("session_id") ?? "");
  const programmeId = String(form.get("programme_id") ?? "");
  const returnPath = String(form.get("return_path") ?? "");
  const base =
    /^\/registers(?:\/[a-z0-9/-]+)?(?:\?tab=(?:clients|contacts|sessions))?$/i.test(
      returnPath,
    ) || /^\/admin\/users\/[0-9a-f-]{36}$/i.test(returnPath)
      ? returnPath
      : /^[0-9a-f-]{36}$/i.test(programmeId)
        ? `/registers/programmes/${programmeId}`
        : /^[0-9a-f-]{36}$/i.test(sessionId)
          ? `/registers/${sessionId}`
          : action === "create_programme"
            ? "/registers/programmes/new"
            : "/registers";
  let errorMessage: string | null = null;
  let resultId: string | null = null;
  let message = "Saved successfully.";
  try {
    if (["create_session", "update_session"].includes(action)) {
      data.starts_at = londonLocalInputToIso(String(data.starts_at));
      data.ends_at = londonLocalInputToIso(String(data.ends_at));
    }
    for (const key of [
      "address_verified",
      "sharing_authorised",
      "notify_absence",
      "enabled",
      "active",
      "notify_attendance",
      "notify_departure",
    ])
      data[key] = form.get(key) === "on";
    const programmeActions = [
      "create_programme",
      "update_programme",
      "programme_permission",
      "programme_enrol",
      "generate_sessions",
    ];
    if (programmeActions.includes(action)) {
      data.excluded_dates = String(form.get("excluded_dates") ?? "")
        .split(/[\s,]+/)
        .filter(Boolean);
      data.active = form.get("active") === "on";
    }
    const rpc = programmeActions.includes(action)
      ? "programme_action"
      : [
            "remove_lead",
            "remove_attendee",
            "update_session",
            "refresh_roster",
          ].includes(action)
        ? "register_setup_action"
        : "register_action";
    const { data: id, error } = await supabase.rpc(rpc, {
      p_action: action,
      p_data: data,
    });
    if (error) throw new Error(error.message);
    resultId = String(id);
    if (action === "confirm") {
      const { error: deliveryError } = await supabase.functions.invoke(
        "register-notifications",
        { body: { session_id: sessionId } },
      );
      message = deliveryError
        ? "Register confirmed. Notifications queued; delivery is unavailable. Check notification history and retry."
        : "Register confirmed. Check notification history for email send status.";
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to save.";
  }
  revalidatePath("/registers", "layout");
  revalidatePath("/account");
  revalidatePath("/admin/users", "layout");
  if (errorMessage)
    redirect(
      `${base}${base.includes("?") ? "&" : "?"}error=${encodeURIComponent(errorMessage)}`,
    );
  redirect(
    `${action === "create_programme" ? `/registers/programmes/${resultId}` : action === "create_session" ? `/registers/${resultId}` : base}${base.includes("?") ? "&" : "?"}message=${encodeURIComponent(message)}`,
  );
}

export type AttendanceInput = {
  client_id: string;
  status: string;
  arrived_at: string;
  departed_at: string;
};
export async function saveAttendance(
  sessionId: string,
  revision: number,
  rows: AttendanceInput[],
  reason: string,
) {
  const { supabase } = await requireProfile();
  const values = rows.map((row) => ({
    ...row,
    arrived_at:
      ["present", "late"].includes(row.status) && row.arrived_at
        ? londonLocalInputToIso(row.arrived_at)
        : null,
    departed_at:
      ["present", "late"].includes(row.status) && row.departed_at
        ? londonLocalInputToIso(row.departed_at)
        : null,
  }));
  const { error } = await supabase.rpc("register_action", {
    p_action: "save_attendance",
    p_data: { session_id: sessionId, revision, rows: values, reason },
  });
  if (error) throw new Error(error.message);
  revalidatePath("/registers", "layout");
  return { success: true };
}

export async function retryRegisterNotifications(form: FormData) {
  const { supabase } = await requireProfile();
  const sessionId = String(form.get("session_id"));
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("Invalid session");
  const { error } = await supabase.functions.invoke("register-notifications", {
    body: { session_id: sessionId },
  });
  revalidatePath(`/registers/${sessionId}`);
  redirect(
    `/registers/${sessionId}?${error ? "error=Email%20delivery%20unavailable.%20The%20register%20remains%20saved." : "message=Notification%20queue%20processed.%20Check%20send%20status%20below."}`,
  );
}

export type LiveAttendanceInput = AttendanceInput & { marked_at: string };
export async function recordLiveAttendance(
  sessionId: string,
  revision: number,
  rows: LiveAttendanceInput[],
  regenerate = false,
) {
  const { supabase } = await requireProfile();
  const values = rows.map((row) => ({
    ...row,
    arrived_at:
      row.status === "present" && row.arrived_at
        ? londonLocalInputToIso(row.arrived_at)
        : null,
    departed_at:
      row.status === "present" && row.departed_at
        ? londonLocalInputToIso(row.departed_at)
        : null,
    marked_at:
      ["present", "absent"].includes(row.status) && row.marked_at
        ? londonLocalInputToIso(row.marked_at)
        : null,
  }));
  const { error } = await supabase.rpc("register_action", {
    p_action: regenerate ? "regenerate_notifications" : "record_attendance",
    p_data: {
      session_id: sessionId,
      revision,
      rows: values,
      reason: regenerate
        ? "Notification regeneration requested"
        : "Register observation or time correction",
    },
  });
  if (error) throw new Error(error.message);
  const { error: deliveryError } = await supabase.functions.invoke(
    "register-notifications",
    { body: { session_id: sessionId } },
  );
  revalidatePath("/registers", "layout");
  return {
    revision: revision + 1,
    message: deliveryError
      ? "Saved. Notifications queued; email sending is paused or unavailable."
      : "Saved. Notification queue processed; check send history.",
  };
}
