"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const DEVICE_ID_KEY = "rcg_kiosk_device_id";
const DEVICE_TOKEN_KEY = "rcg_kiosk_device_token";
const DEVICE_LABEL_KEY = "rcg_kiosk_device_label";

export function KioskDeviceEnrolment() {
  const [label, setLabel] = useState("");
  const [registeredLabel, setRegisteredLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRegisteredLabel(window.localStorage.getItem(DEVICE_LABEL_KEY));
  }, []);

  async function enrol(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error: invokeError } = await supabase.functions.invoke("kiosk-admin", {
      body: {
        action: "enrol",
        label,
        user_agent: navigator.userAgent,
      },
    });

    if (invokeError || !data?.success || !data.device_id || !data.device_token) {
      setBusy(false);
      setError(data?.error || "Unable to enrol this kiosk device.");
      return;
    }

    window.localStorage.setItem(DEVICE_ID_KEY, data.device_id);
    window.localStorage.setItem(DEVICE_TOKEN_KEY, data.device_token);
    window.localStorage.setItem(DEVICE_LABEL_KEY, data.label || label);

    await supabase.auth.signOut();
    window.location.assign("/kiosk");
  }

  return (
    <section className="card p-5 sm:p-6">
      <p className="section-kicker">This browser</p>
      <h2 className="mt-1 text-2xl font-black">Enrol an RCG kiosk</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--rcg-muted)]">
        Do this only on the physical RCG tablet/computer that will act as a shared kiosk. Enrolment stores a device credential in this browser, signs the administrator out, and opens kiosk mode.
      </p>

      {registeredLabel ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          This browser already contains kiosk credentials for <strong>{registeredLabel}</strong>. Enrolling again creates a new device record.
        </p>
      ) : null}
      {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={enrol}>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-extrabold" htmlFor="kiosk-device-label">Device name</label>
          <input
            className="input"
            id="kiosk-device-label"
            value={label}
            onChange={(event) => setLabel(event.target.value.slice(0, 80))}
            placeholder="e.g. Canopy reception tablet"
            minLength={2}
            maxLength={80}
            required
          />
        </div>
        <button className="btn btn-primary self-end" type="submit" disabled={busy}>
          {busy ? "Enrolling…" : "Enrol & open kiosk"}
        </button>
      </form>
    </section>
  );
}
