"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type KioskStatus = {
  allowed: boolean;
  enabled: boolean;
  email: string;
  short_code: string | null;
  pin_set: boolean;
};

export function KioskAccessPanel() {
  const [status, setStatus] = useState<KioskStatus | null>(null);
  const [pin, setPin] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [availability, setAvailability] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    const supabase = createClient();
    const { data, error: invokeError } = await supabase.functions.invoke("account-kiosk", {
      body: { action: "status" },
    });

    if (invokeError || !data?.success) {
      setError(data?.error || "Unable to load kiosk settings.");
      return;
    }

    const next = data as KioskStatus & { success: true };
    setStatus(next);
    setShortCode(next.short_code ?? "");
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function checkShortCode() {
    const code = shortCode.trim();
    if (!code) {
      setAvailability("Optional — you can always use your email.");
      return;
    }

    const supabase = createClient();
    const { data } = await supabase.functions.invoke("account-kiosk", {
      body: { action: "check_short_code", short_code: code },
    });

    if (data?.available) {
      setAvailability("✓ " + data.short_code + " is available");
      setShortCode(data.short_code);
    } else {
      setAvailability(data?.reason || "That short code is already in use.");
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { data, error: invokeError } = await supabase.functions.invoke("account-kiosk", {
      body: {
        action: "set_credentials",
        pin,
        short_code: shortCode.trim(),
      },
    });

    setBusy(false);
    if (invokeError || !data?.success) {
      setError(data?.error || "Unable to save kiosk access.");
      return;
    }

    setPin("");
    setMessage("Kiosk access is ready. Use your email or short code plus this PIN on an enrolled RCG kiosk.");
    await loadStatus();
  }

  async function disable() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { data, error: invokeError } = await supabase.functions.invoke("account-kiosk", {
      body: { action: "disable" },
    });

    setBusy(false);
    if (invokeError || !data?.success) {
      setError(data?.error || "Unable to disable kiosk access.");
      return;
    }

    setMessage("Kiosk access disabled. Your private app account is unchanged.");
    await loadStatus();
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-kicker">Kiosk access</p>
          <h2 className="mt-1 text-2xl font-black">Use an RCG kiosk</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--rcg-muted)]">
            Useful if your phone is unavailable or you prefer not to use phone location. Kiosk verification only works on an RCG-managed kiosk device.
          </p>
        </div>
        <span className={"badge " + (status?.enabled && status.pin_set ? "" : "!bg-slate-100 !text-slate-600")}>
          {!status ? "Checking…" : !status.allowed ? "Disabled by RCG" : status.enabled && status.pin_set ? "Ready" : "Not configured"}
        </span>
      </div>

      {status && !status.allowed ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Kiosk access has been disabled for this account by RCG. Your private app access is unchanged. Ask an administrator if you need kiosk access restored.
        </p>
      ) : null}
      {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_.9fr]">
        <form className="space-y-4" onSubmit={save} aria-disabled={status ? !status.allowed : true}>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="kiosk-pin">Set / change PIN</label>
            <input
              className="input"
              id="kiosk-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="4–6 digits"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              minLength={4}
              maxLength={6}
              required
              disabled={!status?.allowed}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="kiosk-short-code">Optional short code</label>
            <input
              className="input uppercase"
              id="kiosk-short-code"
              value={shortCode}
              onChange={(event) => {
                setShortCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12));
                setAvailability(null);
              }}
              onBlur={() => void checkShortCode()}
              placeholder="e.g. PAUL"
              minLength={3}
              maxLength={12}
              disabled={!status?.allowed}
            />
            <p className="mt-1 text-xs text-[var(--rcg-muted)]">
              {availability ?? "Optional. Your email will always work as your kiosk identifier."}
            </p>
          </div>

          <button className="btn btn-primary" type="submit" disabled={busy || pin.length < 4 || !status?.allowed}>
            {busy ? "Saving…" : status?.pin_set ? "Update kiosk access" : "Enable kiosk access"}
          </button>
        </form>

        <aside className="rounded-2xl bg-[var(--rcg-green-mist)] p-4">
          <p className="text-sm font-black text-[var(--rcg-green-dark)]">How you will sign in</p>
          <dl className="mt-3 space-y-3 text-sm">
            <div><dt className="font-bold text-[var(--rcg-muted)]">Email</dt><dd className="font-extrabold">{status?.email ?? "…"}</dd></div>
            <div><dt className="font-bold text-[var(--rcg-muted)]">Short code</dt><dd className="font-extrabold">{status?.short_code ?? "Not set"}</dd></div>
            <div><dt className="font-bold text-[var(--rcg-muted)]">PIN</dt><dd className="font-extrabold">{status?.pin_set ? "Configured ✓" : "Not set"}</dd></div>
          </dl>
          {status?.allowed && status?.enabled ? (
            <button className="btn btn-soft mt-4 w-full" type="button" onClick={() => void disable()} disabled={busy}>
              Disable my kiosk access
            </button>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
