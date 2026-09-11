"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Result = {
  success?: boolean;
  action?: "clock_in" | "clock_out";
  full_name?: string;
  at?: string;
  error?: string;
};

export function KioskClient() {
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!result?.success) return;
    const timer = window.setTimeout(() => {
      setIdentifier("");
      setPin("");
      setResult(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [result]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);

    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("kiosk-clock", {
      body: { identifier: identifier.trim(), pin },
    });

    setBusy(false);
    if (error) {
      setResult({ error: "Unable to contact the clocking service." });
      return;
    }
    setResult(data as Result);
    if (data?.success) setPin("");
  }

  if (result?.success) {
    const time = result.at
      ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(result.at))
      : null;
    const clockedIn = result.action === "clock_in";

    return (
      <div className="relative overflow-hidden rounded-3xl bg-[var(--rcg-green-soft)] p-7 text-center sm:p-9">
        <div className="pointer-events-none absolute -bottom-10 -right-8 h-36 w-36 bg-[url('/brand/leaves.svg')] bg-contain bg-no-repeat opacity-30" />
        <div className="relative z-10">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--rcg-green)] text-4xl font-black text-white">{clockedIn ? "✓" : "◷"}</div>
          <img className="mx-auto h-28 w-32 object-contain" src="/brand/staff-fox.svg" alt="" />
          <p className="mt-3 text-sm font-extrabold text-[var(--rcg-muted)]">{result.full_name}</p>
          <h2 className="mt-1 text-3xl font-black text-[var(--rcg-green-dark)]">{clockedIn ? "You’re on site!" : "You’ve clocked out"}</h2>
          {time ? <p className="mt-2 font-bold text-[var(--rcg-text)]">{clockedIn ? `Clocked in at ${time}` : `Clocked out at ${time}`}</p> : null}
          <p className="mt-3 text-[var(--rcg-muted)]">{clockedIn ? "Have a great day!" : "See you next time!"}</p>
          <p className="mt-5 text-xs font-bold text-[var(--rcg-muted)]">This screen will reset automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
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
  );
}
