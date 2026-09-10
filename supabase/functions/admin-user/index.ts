import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const jsonHeaders = { "Content-Type": "application/json" };

type Role = "owner" | "admin" | "developer" | "user";
type Actor = { id: string; role: Role; is_active: boolean; archived_at: string | null };

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply({ error: "Service configuration is missing." }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Authentication required." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return reply({ error: "Authentication failed." }, 401);

  const { data: actorData } = await admin
    .from("profiles")
    .select("id,role,is_active,archived_at")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  const actor = actorData as Actor | null;

  if (!actor || !actor.is_active || actor.archived_at || !["owner", "admin", "developer"].includes(actor.role)) {
    return reply({ error: "Administrator access required." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }

  const action = String(body.action ?? "");
  const targetId = String(body.profile_id ?? "");

  async function audit(auditAction: string, profileId: string | null, metadata: Record<string, unknown> = {}) {
    await admin.from("audit_log").insert({
      performed_by_profile_id: actor!.id,
      action: auditAction,
      target_profile_id: profileId,
      metadata,
    });
  }

  if (action === "create_user") {
    const fullName = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const requestedRole = String(body.role ?? "user") as Role;
    const role: Role = actor.role === "owner" && ["admin", "developer", "user"].includes(requestedRole)
      ? requestedRole
      : "user";
    const shortCode = String(body.short_code ?? "").trim() || null;
    const pin = String(body.pin ?? "").trim();

    if (!fullName || !email.includes("@") || password.length < 10) {
      return reply({ error: "Name, valid email and a temporary password of at least 10 characters are required." }, 400);
    }
    if (shortCode && (shortCode.length < 3 || shortCode.length > 12)) {
      return reply({ error: "Short code must be 3–12 characters." }, 400);
    }
    if (pin && !/^\d{4,6}$/.test(pin)) return reply({ error: "PIN must be 4–6 digits." }, 400);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError || !created.user) return reply({ error: "Unable to create the sign-in account. The email may already be in use." }, 400);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        user_id: created.user.id,
        full_name: fullName,
        email,
        role,
        short_code: shortCode,
        can_use_kiosk: true,
      })
      .select("id")
      .single();

    if (profileError || !profile) {
      await admin.auth.admin.deleteUser(created.user.id);
      return reply({ error: "Unable to create the application profile. Check that the email and short code are unique." }, 400);
    }

    if (pin) {
      const pinHash = await bcrypt.hash(pin, 12);
      await admin.from("pin_credentials").upsert({ profile_id: profile.id, pin_hash: pinHash, failed_attempts: 0, locked_until: null });
    }

    await audit("user_created", profile.id, { role, short_code_set: Boolean(shortCode), kiosk_pin_set: Boolean(pin) });
    return reply({ success: true, profile_id: profile.id });
  }

  if (!targetId) return reply({ error: "Target profile is required." }, 400);

  const { data: target } = await admin
    .from("profiles")
    .select("id,user_id,full_name,email,role,is_active,archived_at,can_view_currently_on_site,can_use_kiosk")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return reply({ error: "User not found." }, 404);

  if (action === "set_active") {
    const active = body.active === true;
    if (target.role === "owner" && !active) return reply({ error: "The owner account cannot be archived." }, 400);

    const { error } = await admin.from("profiles").update({
      is_active: active,
      archived_at: active ? null : new Date().toISOString(),
    }).eq("id", targetId);
    if (error) return reply({ error: "Unable to update account status." }, 400);
    await audit(active ? "user_reactivated" : "user_archived", targetId);
    return reply({ success: true });
  }

  if (action === "set_role") {
    if (actor.role !== "owner") return reply({ error: "Only the owner can change roles." }, 403);
    if (target.role === "owner") return reply({ error: "The owner role is protected." }, 400);
    const role = String(body.role ?? "") as Role;
    if (!["admin", "developer", "user"].includes(role)) return reply({ error: "Invalid role." }, 400);

    const { error } = await admin.from("profiles").update({ role }).eq("id", targetId);
    if (error) return reply({ error: "Unable to change role." }, 400);
    await audit("role_changed", targetId, { from: target.role, to: role });
    return reply({ success: true });
  }

  if (action === "set_presence_visibility") {
    const enabled = body.enabled === true;
    const { error } = await admin.from("profiles").update({ can_view_currently_on_site: enabled }).eq("id", targetId);
    if (error) return reply({ error: "Unable to update presence visibility." }, 400);
    await audit("presence_visibility_changed", targetId, { enabled });
    return reply({ success: true });
  }

  if (action === "set_kiosk_access") {
    const enabled = body.enabled === true;
    const { error } = await admin.from("profiles").update({ can_use_kiosk: enabled }).eq("id", targetId);
    if (error) return reply({ error: "Unable to update kiosk access." }, 400);
    await audit("kiosk_access_changed", targetId, { enabled });
    return reply({ success: true });
  }

  if (action === "reset_pin") {
    const pin = String(body.pin ?? "");
    if (!/^\d{4,6}$/.test(pin)) return reply({ error: "PIN must be 4–6 digits." }, 400);
    const pinHash = await bcrypt.hash(pin, 12);
    const { error } = await admin.from("pin_credentials").upsert({
      profile_id: targetId,
      pin_hash: pinHash,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    });
    if (error) return reply({ error: "Unable to reset PIN." }, 400);
    await audit("pin_reset", targetId);
    return reply({ success: true });
  }

  return reply({ error: "Unsupported action." }, 400);
});
