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
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">✓</div>
        <h2 className="text-3xl font-black">{result.full_name}</h2>
        <p className="mt-2 text-xl font-bold text-[var(--rcg-green)]">
          {result.action === "clock_in" ? "Clocked in" : "Clocked out"}
        </p>
        <p className="mt-4 text-sm text-[var(--rcg-muted)]">This screen will reset automatically.</p>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div>
        <label className="mb-1 block text-sm font-bold" htmlFor="identifier">Email or short code</label>
        <input
          className="input text-lg"
          id="identifier"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="off"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold" htmlFor="pin">PIN</label>
        <input
          className="input text-center text-2xl tracking-[.45em]"
          id="pin"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          type="password"
          autoComplete="off"
          minLength={4}
          maxLength={6}
          required
        />
      </div>

      {result?.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{result.error}</p>
      ) : null}

      <button className="btn-primary w-full text-lg" type="submit" disabled={busy}>
        {busy ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
