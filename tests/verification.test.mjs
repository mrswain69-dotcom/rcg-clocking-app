import test from "node:test";
import assert from "node:assert/strict";
import {
  verificationMilestones,
  nextLocationCheck,
} from "../src/lib/verification.ts";
import { summariseRegisterAttendance } from "../src/lib/registers.ts";
import { registerEmail } from "../supabase/functions/_shared/register-email.ts";

test("later successful arrival stays verified despite unavailable clock-in or later GPS", () => {
  const evidence = {
    clock_in_at: "2026-10-03T09:00:00Z",
    clock_in_location_status: "location_unavailable",
    first_on_site_verified_at: "2026-10-03T09:04:00Z",
    last_location_status: "location_uncertain",
  };
  assert.equal(verificationMilestones(evidence)[0].tone, "grey");
  assert.equal(verificationMilestones(evidence)[1].tone, "green");
});
test("immediate departure completes verification; on-site clock-out remains neutral", () => {
  assert.equal(
    verificationMilestones({
      clock_out_at: "2026-10-03T12:00:00Z",
      clock_out_location_status: "outside_site",
    })[2].tone,
    "green",
  );
  assert.equal(
    verificationMilestones({
      clock_out_at: "2026-10-03T12:00:00Z",
      clock_out_location_status: "on_site_verified",
    })[2].tone,
    "grey",
  );
});
test("arrival retries and departure retries are separate from optional 15 minute checks", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  const open = {
    clock_out_at: null,
    first_on_site_verified_at: null,
    first_off_site_verified_at: null,
  };
  assert.equal(nextLocationCheck(open, false, now, now - 60000), "arrival");
  assert.equal(
    nextLocationCheck(
      { ...open, first_on_site_verified_at: "yes" },
      false,
      now,
      0,
    ),
    null,
  );
  assert.equal(
    nextLocationCheck(
      { ...open, first_on_site_verified_at: "yes" },
      true,
      now,
      now - 899999,
    ),
    null,
  );
  assert.equal(
    nextLocationCheck(
      { ...open, first_on_site_verified_at: "yes" },
      true,
      now,
      now - 900000,
    ),
    "periodic",
  );
  const closed = { ...open, clock_out_at: new Date(now - 60000).toISOString() };
  assert.equal(nextLocationCheck(closed, false, now, 0), "departure");
  assert.equal(
    nextLocationCheck(
      { ...closed, first_off_site_verified_at: "yes" },
      true,
      now,
      0,
    ),
    null,
  );
  assert.equal(
    nextLocationCheck(
      { ...closed, clock_out_at: new Date(now - 900000).toISOString() },
      true,
      now,
      0,
    ),
    null,
  );
});
test("attendance counts expected missed sessions and excludes cancellations, drafts and excused from attendance denominator", () => {
  const rows = ["present", "late", "absent", "excused", "unmarked"].map(
    (attendance_status) => ({
      client_id: "a",
      display_name: "Alex B.",
      attendance_status,
      session_status: "confirmed",
    }),
  );
  rows.push(
    { ...rows[2], session_status: "cancelled" },
    { ...rows[2], session_status: "draft" },
  );
  assert.deepEqual(summariseRegisterAttendance(rows)[0], {
    client_id: "a",
    display_name: "Alex B.",
    attended: 2,
    missed: 1,
    excused: 1,
    pending: 2,
  });
});
test("email reports an observation without promising current presence, including clear correction", () => {
  const message = registerEmail({
    display_name: "Alex B.",
    session: "RCG session",
    starts_at: "2026-10-03T09:00:00Z",
    ends_at: "2026-10-03T11:00:00Z",
    status: "present",
    arrived_at: "2026-10-03T09:05:00Z",
    departed_at: null,
    recorded_at: "2026-10-03T09:06:00Z",
    correction: true,
  });
  assert.equal(message.subject, "RCG attendance correction");
  assert.match(message.text, /Alex B. was recorded as present/);
  assert.match(message.text, /not a live location confirmation/);
});
