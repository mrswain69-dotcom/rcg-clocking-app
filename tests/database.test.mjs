import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const ids = {
  owner: "11111111-1111-4111-8111-111111111111",
  lead: "22222222-2222-4222-8222-222222222222",
  other: "33333333-3333-4333-8333-333333333333",
  developer: "44444444-4444-4444-8444-444444444444",
};
let db;
async function as(id, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec(`set role ${role}`);
}
const action = async (name, data) =>
  (
    await db.query("select public.register_action($1,$2::jsonb) as id", [
      name,
      JSON.stringify(data),
    ])
  ).rows[0].id;
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
async function sessionState(id) {
  return (
    await query("select * from public.register_sessions where id=$1", [id])
  )[0];
}
const phase = async (
  session,
  kind,
  lat = 51.43362,
  lon = -2.57128,
  accuracy = 10,
) =>
  query("select * from public.record_session_location($1,$2,$3,$4,$5)", [
    session,
    kind,
    lat,
    lon,
    accuracy,
  ]);

test("new migrations enforce verification consent, ownership, register access and notification routing", async (t) => {
  db = new PGlite();
  await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema private;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth,private to authenticated,service_role,anon;
 create type public.app_role as enum('owner','admin','developer','user');
 create type public.clock_method as enum('web','kiosk','admin_override');
 create table public.profiles(id uuid primary key,user_id uuid,role public.app_role,is_active boolean default true,archived_at timestamptz,full_name text default 'Test account',profile_type text default 'account');
 create table public.settings(id int primary key,site_latitude float8,site_longitude float8,site_geofence_radius_m int,site_location_accuracy_limit_m int);
 insert into public.settings values(1,51.43362,-2.57128,70,100);
 create table public.sessions(id uuid primary key default gen_random_uuid(),profile_id uuid references public.profiles(id),clock_in_at timestamptz default now(),clock_out_at timestamptz,clock_in_method public.clock_method default 'web',clock_out_method public.clock_method,clock_in_location_status text,clock_in_distance_m int,clock_in_accuracy_m int,first_on_site_verified_at timestamptz,first_on_site_verification_method text,last_presence_check_at timestamptz,last_presence_distance_m int,last_presence_accuracy_m int,current_presence_status text,current_presence_status_at timestamptz,current_presence_source text);
 create table public.audit_log(id uuid primary key default gen_random_uuid(),performed_by_profile_id uuid,action text,target_profile_id uuid,metadata jsonb);
 grant select on public.profiles,public.sessions to authenticated;
 `);
  const migrationNames = (await readdir("supabase/migrations"))
    .filter((n) =>
      /_(verification_milestones|session_registers|register_programmes)\.sql$/.test(
        n,
      ),
    )
    .sort();
  for (const name of migrationNames)
    await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
  for (const [name, id] of Object.entries(ids))
    await db.query(
      "insert into public.profiles(id,user_id,role) values($1,$1,$2)",
      [
        id,
        name === "owner"
          ? "owner"
          : name === "developer"
            ? "developer"
            : "user",
      ],
    );
  const visit = (
    await query(
      "insert into public.sessions(profile_id,clock_in_location_status) values($1,'location_unavailable') returning id",
      [ids.lead],
    )
  )[0].id;
  await as(ids.lead);
  await t.test(
    "uncertain GPS never establishes presence; later good GPS persists",
    async () => {
      const uncertain = await phase(visit, "arrival", 51.43362, -2.57128, 500);
      assert.equal(uncertain[0].location_status, "location_uncertain");
      assert.equal(uncertain[0].verified_at, null);
      assert.equal(
        (await phase(visit, "arrival"))[0].location_status,
        "on_site_verified",
      );
      await assert.rejects(phase(visit, "periodic"), /disabled/);
      await db.query("select public.set_location_check_preference(true)");
      await phase(visit, "periodic", 51.45, -2.58, 10);
      const state = (
        await query("select * from public.sessions where id=$1", [visit])
      )[0];
      assert.ok(state.first_on_site_verified_at);
      assert.equal(state.last_location_status, "outside_site");
      await assert.rejects(phase(visit, "periodic"), /not due/);
      await db.query("select public.set_location_check_preference(false)");
      await assert.rejects(phase(visit, "periodic"), /disabled/);
    },
  );
  await t.test(
    "other accounts cannot submit readings for someone else",
    async () => {
      await as(ids.other);
      await assert.rejects(phase(visit, "arrival"), /Session not found/);
      await as(ids.lead);
    },
  );
  await t.test(
    "clock-out saves immediately; accurate off-site check ends retry",
    async () => {
      const closed = (
        await query("select public.clock_out_for_verification() as id")
      )[0].id;
      assert.equal(closed, visit);
      assert.equal(
        (await phase(visit, "clock_out", 51.45, -2.58, 10))[0].location_status,
        "outside_site",
      );
      const persisted = (
        await query("select * from public.sessions where id=$1", [visit])
      )[0];
      assert.ok(persisted.clock_out_at);
      assert.ok(persisted.first_off_site_verified_at);
      assert.equal(
        (await phase(visit, "departure"))[0].location_status,
        "outside_site",
      );
    },
  );
  await as(ids.owner);
  const clientA = await action("create_client", {
    full_name: "Alex Bennett",
    display_name: "Alex B.",
  });
  const clientB = await action("create_client", {
    full_name: "Jamie Green",
    display_name: "Jamie G.",
  });
  const session = await action("create_session", {
    name: "Internal group",
    starts_at: new Date(Date.now() - 7200000).toISOString(),
    ends_at: new Date(Date.now() - 3600000).toISOString(),
    kind: "group",
  });
  const mutate = async (name, data = {}) =>
    action(name, {
      session_id: session,
      revision: (await sessionState(session)).revision,
      ...data,
    });
  await mutate("enrol", { client_id: clientA });
  await mutate("enrol", { client_id: clientB });
  await mutate("assign_lead", { profile_id: ids.lead });
  await t.test(
    "recipient approval requires both explicit checks, and client relationship is fixed",
    async () => {
      await assert.rejects(
        action("approve_contact", {
          client_id: clientA,
          label: "Carer",
          email: "carer@example.org",
          reason: "Checked",
        }),
        /Confirm verified/,
      );
      await action("approve_contact", {
        client_id: clientA,
        label: "Carer A",
        email: "a@example.org",
        reason: "Verified with RCG",
        address_verified: true,
        sharing_authorised: true,
      });
      await action("approve_contact", {
        client_id: clientB,
        label: "School B",
        email: "b@example.org",
        reason: "Verified with school",
        address_verified: true,
        sharing_authorised: true,
      });
    },
  );
  await t.test(
    "unassigned users and developers cannot read registers or client identities",
    async () => {
      for (const id of [ids.other, ids.developer]) {
        await as(id);
        assert.equal(
          (await query("select * from public.register_sessions")).length,
          0,
        );
        assert.equal(
          (await query("select * from public.register_clients")).length,
          0,
        );
        assert.equal(
          (await query("select * from public.register_contacts")).length,
          0,
        );
        await assert.rejects(
          db.query("select * from public.register_roster($1)", [session]),
          /access denied/,
        );
      }
    },
  );
  await as(ids.lead);
  await t.test(
    "assigned lead sees display names and cannot manage contacts",
    async () => {
      const roster = await query("select * from public.register_roster($1)", [
        session,
      ]);
      assert.equal(roster.length, 2);
      assert.equal(roster[0].display_name, "Alex B.");
      assert.equal(Object.hasOwn(roster[0], "full_name"), false);
      assert.equal(
        (await query("select * from public.register_clients")).length,
        0,
      );
      await assert.rejects(
        action("approve_contact", { client_id: clientA }),
        /manager permission/,
      );
      await assert.rejects(
        db.query("select * from public.claim_register_notifications($1)", [
          session,
        ]),
        /permission denied/,
      );
    },
  );
  await t.test(
    "drafts send nothing; stale revisions and incomplete confirmation are rejected",
    async () => {
      await assert.rejects(mutate("confirm"), /Mark every/);
      const revision = (await sessionState(session)).revision;
      await mutate("save_attendance", {
        rows: [
          { client_id: clientA, status: "present" },
          { client_id: clientB, status: "present" },
        ],
      });
      assert.equal(
        (await query("select * from public.register_notifications")).length,
        0,
      );
      await assert.rejects(
        action("confirm", { session_id: session, revision }),
        /Register changed/,
      );
    },
  );
  await t.test(
    "confirmation queues exactly one client per recipient, never full names",
    async () => {
      await mutate("confirm");
      const jobs = await query(
        "select * from public.register_notifications order by recipient",
      );
      assert.equal(jobs.length, 2);
      assert.equal(jobs[0].recipient, "a@example.org");
      assert.equal(jobs[0].payload.display_name, "Alex B.");
      assert.equal(jobs[0].payload.session, "RCG session");
      assert.equal(jobs[1].recipient, "b@example.org");
      assert.equal(jobs[1].payload.display_name, "Jamie G.");
      assert.ok(!JSON.stringify(jobs).includes("Alex Bennett"));
      await assert.rejects(mutate("confirm"), /already confirmed/);
      await assert.rejects(
        mutate("save_attendance", {
          rows: [{ client_id: clientA, status: "absent" }],
          reason: "Correction",
        }),
        /Manager and correction reason/,
      );
    },
  );
  await as(ids.owner);
  await t.test(
    "manager correction supersedes unsent notifications and records history",
    async () => {
      await mutate("save_attendance", {
        rows: [{ client_id: clientA, status: "absent" }],
        reason: "Incorrectly marked present",
      });
      const old = await query("select * from public.register_notifications");
      assert.ok(old.every((n) => n.status === "superseded"));
      await mutate("confirm");
      const current = await query(
        "select * from public.register_notifications where status='pending'",
      );
      assert.equal(current.length, 1);
      assert.equal(current[0].payload.display_name, "Jamie G.");
      assert.ok(
        (
          await query(
            "select * from public.register_audit where action='attendance_change'",
          )
        ).length >= 3,
      );
    },
  );
  await t.test(
    "queue claim prevents duplicate claims and contact disabling blocks sending",
    async () => {
      await as(null, "service_role");
      const claimed = await query(
        "select * from public.claim_register_notifications($1)",
        [session],
      );
      assert.equal(claimed.length, 1);
      assert.equal(
        (
          await query("select * from public.claim_register_notifications($1)", [
            session,
          ])
        ).length,
        0,
      );
      await db.query(
        "update public.register_notifications set status='failed' where id=$1",
        [claimed[0].id],
      );
      await as(ids.owner);
      await action("deactivate_contact", { contact_id: claimed[0].contact_id });
      await as(null, "service_role");
      assert.equal(
        (
          await query("select * from public.claim_register_notifications($1)", [
            session,
          ])
        ).length,
        0,
      );
      await as(ids.owner);
    },
  );
  await t.test(
    "direct writes are denied; individual sessions cannot enrol two clients",
    async () => {
      await assert.rejects(
        db.query(
          "insert into public.register_clients(full_name,display_name) values('Bypass','B.')",
        ),
        /permission denied/,
      );
      const individual = await action("create_session", {
        name: "One-to-one",
        starts_at: new Date(Date.now() - 7200000).toISOString(),
        ends_at: new Date(Date.now() - 3600000).toISOString(),
        kind: "individual",
      });
      await action("enrol", {
        session_id: individual,
        revision: 1,
        client_id: clientA,
      });
      await assert.rejects(
        action("enrol", {
          session_id: individual,
          revision: 2,
          client_id: clientB,
        }),
        /already has an attendee/,
      );
    },
  );
  await t.test(
    "sent attendance corrections notify the original contact even without absence opt-in",
    async () => {
      await as(ids.owner);
      const corrected = await action("create_session", {
        name: "Correction test",
        starts_at: new Date(Date.now() - 7200000).toISOString(),
        ends_at: new Date(Date.now() - 3600000).toISOString(),
        kind: "individual",
      });
      const change = async (name, data = {}) =>
        action(name, {
          session_id: corrected,
          revision: (await sessionState(corrected)).revision,
          ...data,
        });
      await change("enrol", { client_id: clientA });
      await change("save_attendance", {
        rows: [{ client_id: clientA, status: "present" }],
      });
      await change("confirm");
      await db.exec("reset role");
      await db.query(
        "update public.register_notifications set status='sent',sent_at=now() where session_id=$1",
        [corrected],
      );
      await as(ids.owner);
      await change("save_attendance", {
        rows: [{ client_id: clientA, status: "absent" }],
        reason: "Attendance recorded in error",
      });
      await change("confirm");
      const pending = await query(
        "select * from public.register_notifications where session_id=$1 and status='pending'",
        [corrected],
      );
      assert.equal(pending.length, 1);
      assert.equal(pending[0].recipient, "a@example.org");
      assert.equal(pending[0].payload.status, "absent");
      assert.equal(pending[0].payload.correction, true);
      await as(null, "service_role");
      const claimed = await query(
        "select * from public.claim_register_notifications($1)",
        [corrected],
      );
      assert.equal(claimed.length, 1);
      await db.query(
        "update public.register_notifications set status='failed',first_attempted_at=now()-interval '24 hours',attempted_at=now()-interval '1 hour' where id=$1",
        [claimed[0].id],
      );
      assert.equal(
        (
          await query("select * from public.claim_register_notifications($1)", [
            corrected,
          ])
        ).length,
        0,
      );
      await as(ids.owner);
    },
  );
  await t.test(
    "anonymous callers cannot execute exposed mutation wrappers",
    async () => {
      await as(null, "anon");
      await assert.rejects(
        db.query("select public.set_location_check_preference(true)"),
        /permission denied/,
      );
      await assert.rejects(
        action("create_client", { full_name: "Anonymous", display_name: "A." }),
        /permission denied/,
      );
      await as(ids.owner);
    },
  );
  await t.test(
    "programmes generate dated snapshots, respect enrolments and UK daylight saving",
    async () => {
      await as(ids.owner);
      const rpc = async (name, values) =>
        (
          await query("select public.programme_action($1,$2::jsonb) as id", [
            name,
            JSON.stringify(values),
          ])
        )[0].id;
      const programme = await rpc("create_programme", {
        name: "Sunday group",
        external_label: "RCG session",
        kind: "group",
        first_date: "2030-03-24",
        last_date: "2030-04-14",
        start_time: "10:00",
        end_time: "12:00",
        interval_weeks: 1,
        excluded_dates: ["2030-04-14"],
      });
      const client = await action("create_client", {
        full_name: "Protected Programme Client",
        display_name: "Pat C.",
      });
      let revision = 1;
      const mutate = async (name, values = {}) => {
        const result = await rpc(name, {
          programme_id: programme,
          revision,
          ...values,
        });
        revision++;
        return result;
      };
      await mutate("programme_enrol", {
        client_id: client,
        from_date: "2030-03-24",
        to_date: "2030-03-31",
      });
      await mutate("programme_permission", {
        profile_id: ids.lead,
        access_role: "coordinator",
      });
      await mutate("programme_permission", {
        profile_id: ids.other,
        access_role: "viewer",
      });
      await mutate("programme_permission", {
        profile_id: ids.developer,
        access_role: "lead",
      });
      await mutate("generate_sessions");
      const sessions = await query(
        "select * from public.register_sessions where programme_id=$1 order by starts_at",
        [programme],
      );
      assert.equal(sessions.length, 3);
      assert.equal(new Date(sessions[0].starts_at).getUTCHours(), 10);
      assert.equal(new Date(sessions[1].starts_at).getUTCHours(), 9);
      assert.equal(
        (
          await query("select * from public.register_roster($1)", [
            sessions[0].id,
          ])
        ).length,
        1,
      );
      assert.equal(
        (
          await query("select * from public.register_roster($1)", [
            sessions[2].id,
          ])
        ).length,
        0,
      );
      await mutate("generate_sessions");
      assert.equal(
        (
          await query(
            "select * from public.register_sessions where programme_id=$1",
            [programme],
          )
        ).length,
        3,
      );
      await mutate("programme_enrol", {
        client_id: client,
        from_date: "2030-03-24",
        to_date: "2030-03-24",
      });
      assert.equal(
        (
          await query("select * from public.register_roster($1)", [
            sessions[1].id,
          ])
        ).length,
        1,
        "existing roster is a snapshot",
      );
      await as(ids.other);
      assert.equal(
        (
          await query(
            "select * from public.register_sessions where programme_id=$1",
            [programme],
          )
        ).length,
        3,
      );
      assert.equal(
        (await query("select * from public.register_clients")).length,
        0,
      );
      const cap = (
        await query("select public.register_capabilities(null,$1) as cap", [
          sessions[0].id,
        ])
      )[0].cap;
      assert.equal(cap.take, false);
      assert.equal(cap.manage, false);
      await assert.rejects(
        action("save_attendance", {
          session_id: sessions[0].id,
          revision: 1,
          rows: [],
        }),
        /Attendance permission/,
      );
      await assert.rejects(
        action("confirm", { session_id: sessions[0].id, revision: 1 }),
        /Attendance permission/,
      );
      await assert.rejects(
        query("select * from public.register_recipient_preview($1)", [
          sessions[0].id,
        ]),
        /access denied/,
      );
      await assert.rejects(
        rpc("generate_sessions", { programme_id: programme, revision }),
        /Coordinator permission/,
      );
      await as(ids.developer);
      assert.equal(
        (
          await query("select public.register_capabilities(null,$1) as cap", [
            sessions[0].id,
          ])
        )[0].cap.take,
        true,
      );
      await assert.rejects(
        action("cancel", {
          session_id: sessions[0].id,
          revision: 1,
          reason: "Not allowed",
        }),
        /Coordinator permission/,
      );
      await as(ids.lead);
      await assert.rejects(
        mutate("programme_permission", {
          profile_id: ids.other,
          access_role: "coordinator",
        }),
        /manager permission/,
      );
      await assert.rejects(
        mutate("programme_enrol", {
          client_id: clientB,
          from_date: "2030-03-24",
        }),
        /allocate client/,
      );
      const minimal = (
        await query("select * from public.programme_roster($1)", [programme])
      )[0];
      assert.equal(minimal.display_name, "Pat C.");
      assert.equal(minimal.full_name, undefined);
      await query(
        "select public.register_setup_action('refresh_roster',$1::jsonb)",
        [JSON.stringify({ session_id: sessions[1].id, revision: 1 })],
      );
      assert.equal(
        (
          await query("select * from public.register_roster($1)", [
            sessions[1].id,
          ])
        ).length,
        0,
      );
      await as(ids.owner);
      await mutate("programme_permission", {
        profile_id: ids.other,
        access_role: "none",
      });
      await as(ids.other);
      assert.equal(
        (
          await query(
            "select * from public.register_sessions where programme_id=$1",
            [programme],
          )
        ).length,
        0,
        "revocation is immediate",
      );
      await as(ids.owner);
    },
  );
  await t.test(
    "register management is independent of clocking admin role and grants are audited",
    async () => {
      await as(ids.owner);
      await action("manager_permission", {
        profile_id: ids.other,
        enabled: true,
      });
      await as(ids.other);
      await action("create_client", {
        full_name: "Manager test",
        display_name: "M. T.",
      });
      await assert.rejects(
        action("manager_permission", {
          profile_id: ids.developer,
          enabled: true,
        }),
        /Owner permission/,
      );
      await as(ids.owner);
      await action("manager_permission", {
        profile_id: ids.other,
        enabled: false,
      });
      await as(ids.other);
      await assert.rejects(
        action("create_client", {
          full_name: "No access",
          display_name: "N. A.",
        }),
        /manager permission/,
      );
      await as(ids.owner);
    },
  );
  await t.test(
    "fortnightly individual bookings reject overlap and setup changes cannot rewrite recorded attendance",
    async () => {
      await as(ids.owner);
      const rpc = async (name, values) =>
        (
          await query("select public.programme_action($1,$2::jsonb) as id", [
            name,
            JSON.stringify(values),
          ])
        )[0].id;
      const pid = await rpc("create_programme", {
        name: "Individual booking",
        external_label: "RCG session",
        kind: "individual",
        first_date: "2030-06-03",
        last_date: "2030-07-01",
        start_time: "09:00",
        end_time: "10:00",
        interval_weeks: 2,
        excluded_dates: [],
      });
      let revision = 1;
      const change = async (name, values = {}) => {
        const result = await rpc(name, {
          programme_id: pid,
          revision,
          ...values,
        });
        revision++;
        return result;
      };
      await change("programme_enrol", {
        client_id: clientA,
        from_date: "2030-06-03",
        to_date: "2030-06-17",
      });
      await assert.rejects(
        change("programme_enrol", {
          client_id: clientB,
          from_date: "2030-06-17",
        }),
        /already has an attendee/,
      );
      await change("programme_enrol", {
        client_id: clientB,
        from_date: "2030-06-18",
      });
      await assert.rejects(
        rpc("generate_sessions", { programme_id: pid, revision: 1 }),
        /Programme changed/,
      );
      await change("generate_sessions");
      const dates = await query(
        "select * from public.register_sessions where programme_id=$1 order by programme_date",
        [pid],
      );
      assert.equal(dates.length, 3);
      assert.equal(
        (
          await query("select * from public.register_roster($1)", [dates[0].id])
        )[0].client_id,
        clientA,
      );
      assert.equal(
        (
          await query("select * from public.register_roster($1)", [dates[2].id])
        )[0].client_id,
        clientB,
      );
      const sid = dates[0].id;
      await action("assign_lead", {
        session_id: sid,
        revision: 1,
        profile_id: ids.lead,
      });
      await action("save_attendance", {
        session_id: sid,
        revision: 2,
        rows: [{ client_id: clientA, status: "present" }],
      });
      await assert.rejects(
        query(
          "select public.register_setup_action('refresh_roster',$1::jsonb)",
          [JSON.stringify({ session_id: sid, revision: 3 })],
        ),
        /untouched/,
      );
      await action("confirm", { session_id: sid, revision: 3 });
      await action("save_attendance", {
        session_id: sid,
        revision: 4,
        rows: [{ client_id: clientA, status: "absent" }],
        reason: "Correction",
      });
      await as(ids.lead);
      await assert.rejects(
        action("save_attendance", {
          session_id: sid,
          revision: 5,
          rows: [{ client_id: clientA, status: "present" }],
          reason: "Reopened draft bypass",
        }),
        /Manager and correction reason/,
      );
      await assert.rejects(
        action("confirm", { session_id: sid, revision: 5 }),
        /Manager must confirm/,
      );
      await as(ids.owner);
      await action("cancel", {
        session_id: sid,
        revision: 5,
        reason: "Cancelled",
      });
      await query(
        "select public.register_setup_action('remove_lead',$1::jsonb)",
        [
          JSON.stringify({
            session_id: sid,
            revision: 6,
            profile_id: ids.lead,
          }),
        ],
      );
      await as(ids.lead);
      assert.equal(
        (
          await query("select * from public.register_sessions where id=$1", [
            sid,
          ])
        ).length,
        0,
      );
      await as(null, "anon");
      await assert.rejects(
        rpc("generate_sessions", { programme_id: pid, revision }),
        /permission denied/,
      );
      await as(ids.owner);
      await assert.rejects(
        query(
          "insert into public.register_programme_access values($1,$2,'coordinator')",
          [pid, ids.other],
        ),
        /permission denied/,
      );
    },
  );
  await t.test(
    "expired departure checks and archived accounts cannot collect further evidence",
    async () => {
      await as(null, "service_role"); // switch back to schema owner for fixture updates
      await db.exec("reset role");
      await db.query(
        "update public.sessions set first_off_site_verified_at=null,clock_out_at=now()-interval '16 minutes' where id=$1",
        [visit],
      );
      await as(ids.lead);
      await assert.rejects(phase(visit, "departure"), /window has ended/);
      await db.exec("reset role");
      await db.query("update public.profiles set is_active=false where id=$1", [
        ids.lead,
      ]);
      await as(ids.lead);
      await assert.rejects(phase(visit, "arrival"), /Active account required/);
    },
  );
  await db.close();
});
