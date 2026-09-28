"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const DEVICE_ID_KEY = "rcg_kiosk_device_id";
const DEVICE_TOKEN_KEY = "rcg_kiosk_device_token";
const DEVICE_LABEL_KEY = "rcg_kiosk_device_label";

type DeviceState = {
  id: string;
  token: string;
  label: string;
};

type ClockResult = {
  success?: boolean;
  action?: "clock_in" | "clock_out";
  full_name?: string;
  at?: string;
  error?: string;
};

type AttendancePerson = {
  id: string;
  full_name: string;
  organisation: string | null;
  attendance_category: string;
};

type Mode = "home" | "registered" | "volunteer" | "visitor";

function formatTime(value?: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

export function KioskClient() {
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [deviceChecking, setDeviceChecking] = useState(true);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("home");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ClockResult | null>(null);

  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");

  const [attendanceName, setAttendanceName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [matches, setMatches] = useState<AttendancePerson[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    async function validate() {
      const id = window.localStorage.getItem(DEVICE_ID_KEY) ?? "";
      const token = window.localStorage.getItem(DEVICE_TOKEN_KEY) ?? "";
      const label = window.localStorage.getItem(DEVICE_LABEL_KEY) ?? "";

      if (!id || !token) {
        setDeviceChecking(false);
        setDeviceError("This browser has not been enrolled as an RCG kiosk.");
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("kiosk-clock", {
        body: {
          action: "device_status",
          device_id: id,
          device_token: token,
        },
      });

      setDeviceChecking(false);

      if (error || !data?.success) {
        setDeviceError(data?.error || "This kiosk device is no longer authorised.");
        return;
      }

      const verifiedLabel = String(data.device_label || label || "RCG kiosk");
      window.localStorage.setItem(DEVICE_LABEL_KEY, verifiedLabel);
      setDevice({ id, token, label: verifiedLabel });
    }

    void validate();
  }, []);

  useEffect(() => {
    if (!result?.success) return;
    const timer = window.setTimeout(() => resetToHome(), 6000);
    return () => window.clearTimeout(timer);
  }, [result]);

  function resetToHome() {
    setMode("home");
    setResult(null);
    setIdentifier("");
    setPin("");
    setAttendanceName("");
    setOrganisation("");
    setMatches([]);
    setSearched(false);
  }

  async function registeredClock(event: React.FormEvent) {
    event.preventDefault();
    if (!device) return;

    setBusy(true);
    setResult(null);

    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("kiosk-clock", {
      body: {
        device_id: device.id,
        device_token: device.token,
        identifier: identifier.trim(),
        pin,
      },
    });

    setBusy(false);
    if (error) {
      setResult({ error: data?.error || "Unable to contact the clocking service." });
      return;
    }

    setResult(data as ClockResult);
    if (data?.success) setPin("");
  }

  async function searchAttendance(event: React.FormEvent) {
    event.preventDefault();
    if (!device) return;

    setBusy(true);
    setMatches([]);
    setSearched(false);
    setResult(null);

    const category = mode === "visitor" ? "visitor" : "one_off_volunteer";
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("kiosk-attendance", {
      body: {
        action: "search",
        device_id: device.id,
        device_token: device.token,
        category,
        name: attendanceName.trim(),
      },
    });

    setBusy(false);
    if (error || !data?.success) {
      setResult({ error: data?.error || "Unable to search attendance records." });
      return;
    }

    setMatches((data.people ?? []) as AttendancePerson[]);
    setSearched(true);
  }

  async function clockAttendance(profileId?: string) {
    if (!device) return;

    setBusy(true);
    setResult(null);

    const category = mode === "visitor" ? "visitor" : "one_off_volunteer";
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("kiosk-attendance", {
      body: {
        action: "clock",
        device_id: device.id,
        device_token: device.token,
        category,
        profile_id: profileId || null,
        full_name: attendanceName.trim(),
        organisation: organisation.trim(),
      },
    });

    setBusy(false);
    if (error || !data?.success) {
      setResult({ error: data?.error || "Unable to update attendance." });
      return;
    }

    setResult(data as ClockResult);
  }

  if (deviceChecking) {
    return (
      <div className="py-10 text-center">
        <p className="section-kicker">Kiosk mode</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--rcg-green-deep)]">Checking this device…</h1>
      </div>
    );
  }

  if (!device || deviceError) {
    return (
      <div className="py-7 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">🔒</div>
        <p className="section-kicker mt-5">Kiosk unavailable</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--rcg-green-deep)]">This is not an enrolled RCG kiosk</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--rcg-muted)]">
          Kiosk attendance is only accepted from devices that an RCG administrator has enrolled. This prevents a phone or computer away from the garden being used as an on-site kiosk.
        </p>
        {deviceError ? <p className="mx-auto mt-4 max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{deviceError}</p> : null}
        <Link className="btn btn-secondary mt-6" href="/login?next=/admin/kiosk-devices">Admin sign in to enrol this device</Link>
      </div>
    );
  }

  if (result?.success) {
    const clockedIn = result.action === "clock_in";
    const time = formatTime(result.at);

    return (
      <div className="relative overflow-hidden rounded-3xl bg-[var(--rcg-green-soft)] p-7 text-center sm:p-9">
        <div className="relative z-10">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--rcg-green)] text-4xl font-black text-white">{clockedIn ? "✓" : "◷"}</div>
          <img className="mx-auto h-28 w-32 object-contain" src="/brand/staff-fox.svg" alt="" />
          <p className="mt-3 text-sm font-extrabold text-[var(--rcg-muted)]">{result.full_name}</p>
          <h2 className="mt-1 text-3xl font-black text-[var(--rcg-green-dark)]">{clockedIn ? "You’re signed in!" : "You’re signed out"}</h2>
          {time ? <p className="mt-2 font-bold text-[var(--rcg-text)]">{clockedIn ? "Clocked in at " + time : "Clocked out at " + time}</p> : null}
          <p className="mt-3 text-[var(--rcg-muted)]">{clockedIn ? "You are recorded as being on site." : "Thanks — your attendance has been updated."}</p>
          <button className="btn btn-secondary mt-5" type="button" onClick={resetToHome}>Done</button>
        </div>
      </div>
    );
  }

  if (mode === "registered") {
    return (
      <div>
        <button className="text-sm font-extrabold text-[var(--rcg-green-dark)]" type="button" onClick={resetToHome}>← Back</button>
        <div className="mt-4 text-center">
          <p className="section-kicker">Staff & regular volunteers</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--rcg-green-deep)]">Clock in or out</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">Use your email or short code and your kiosk PIN.</p>
        </div>

        <form className="mt-6 space-y-5" onSubmit={registeredClock}>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="identifier">Email or short code</label>
            <input className="input text-lg" id="identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="off" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="pin">PIN</label>
            <input className="input text-center text-2xl tracking-[.45em]" id="pin" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" autoComplete="off" minLength={4} maxLength={6} required />
          </div>

          {result?.error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{result.error}</p> : null}

          <button className="btn btn-primary w-full text-lg" type="submit" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        </form>
      </div>
    );
  }

  if (mode === "volunteer" || mode === "visitor") {
    const isVolunteer = mode === "volunteer";
    return (
      <div>
        <button className="text-sm font-extrabold text-[var(--rcg-green-dark)]" type="button" onClick={resetToHome}>← Back</button>
        <div className="mt-4 text-center">
          <p className="section-kicker">{isVolunteer ? "Volunteering today" : "Visitor sign in"}</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--rcg-green-deep)]">{isVolunteer ? "Record your volunteer time" : "Sign in or out"}</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">
            {isVolunteer ? "For one-off, corporate, course and occasional volunteers." : "For meetings, media, contractors and other visitors."}
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={searchAttendance}>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="attendance-name">Your name</label>
            <input className="input text-lg" id="attendance-name" value={attendanceName} onChange={(event) => { setAttendanceName(event.target.value); setSearched(false); setMatches([]); }} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="attendance-org">Organisation <span className="font-normal text-[var(--rcg-muted)]">(optional)</span></label>
            <input className="input" id="attendance-org" value={organisation} onChange={(event) => setOrganisation(event.target.value.slice(0, 160))} placeholder={isVolunteer ? "e.g. Tesco / company / course" : "e.g. BBC / contractor company"} />
          </div>
          <button className="btn btn-primary w-full" type="submit" disabled={busy || attendanceName.trim().length < 2}>{busy ? "Searching…" : "Find my record"}</button>
        </form>

        {result?.error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{result.error}</p> : null}

        {searched ? (
          <div className="mt-5 space-y-3">
            {matches.length ? (
              <>
                <p className="text-sm font-black">Have you been here before?</p>
                {matches.map((person) => (
                  <button
                    className="w-full rounded-2xl border border-[var(--rcg-border)] bg-white p-4 text-left transition hover:border-[var(--rcg-green)]"
                    key={person.id}
                    type="button"
                    onClick={() => void clockAttendance(person.id)}
                    disabled={busy}
                  >
                    <strong className="block text-[var(--rcg-green-dark)]">{person.full_name}</strong>
                    <span className="mt-1 block text-sm text-[var(--rcg-muted)]">{person.organisation || (isVolunteer ? "Volunteer" : "Visitor")}</span>
                    <span className="mt-2 block text-sm font-extrabold">That’s me →</span>
                  </button>
                ))}
                <button className="btn btn-soft w-full" type="button" onClick={() => void clockAttendance()} disabled={busy}>None of these — create a new record</button>
              </>
            ) : (
              <button className="btn btn-primary w-full" type="button" onClick={() => void clockAttendance()} disabled={busy}>
                {busy ? "Saving…" : "Create my attendance record & continue"}
              </button>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="section-kicker">Trusted kiosk · {device.label}</p>
      <h1 className="mt-2 text-4xl font-black text-[var(--rcg-green-deep)]">Welcome to Redcatch</h1>
      <p className="mt-2 text-[var(--rcg-muted)]">How are you here today?</p>

      <div className="mt-7 grid gap-4">
        <button className="rounded-2xl border border-[var(--rcg-border)] bg-[var(--rcg-green-mist)] p-5 text-left transition hover:border-[var(--rcg-green)]" type="button" onClick={() => setMode("registered")}>
          <strong className="block text-xl text-[var(--rcg-green-dark)]">Staff / regular volunteer</strong>
          <span className="mt-1 block text-sm text-[var(--rcg-muted)]">Use your RCG email/short code and PIN.</span>
        </button>
        <button className="rounded-2xl border border-[var(--rcg-border)] bg-white p-5 text-left transition hover:border-[var(--rcg-green)]" type="button" onClick={() => setMode("volunteer")}>
          <strong className="block text-xl text-[var(--rcg-green-dark)]">Volunteering today</strong>
          <span className="mt-1 block text-sm text-[var(--rcg-muted)]">One-off, corporate, course or occasional volunteer.</span>
        </button>
        <button className="rounded-2xl border border-[var(--rcg-border)] bg-white p-5 text-left transition hover:border-[var(--rcg-green)]" type="button" onClick={() => setMode("visitor")}>
          <strong className="block text-xl text-[var(--rcg-green-dark)]">Visiting RCG</strong>
          <span className="mt-1 block text-sm text-[var(--rcg-muted)]">Meeting, media, contractor, guest or other visitor.</span>
        </button>
      </div>

      <div className="mt-7 border-t border-[var(--rcg-border)] pt-4">
        <Link className="text-xs font-bold text-[var(--rcg-muted)]" href="/login?next=/admin/kiosk-devices">Admin maintenance</Link>
      </div>
    </div>
  );
}
