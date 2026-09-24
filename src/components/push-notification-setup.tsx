"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/(app)/dashboard/actions";

type Status = "checking" | "unsupported" | "default" | "enabled" | "denied" | "error";

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function persistSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Push subscription is incomplete.");
  }

  await savePushSubscription({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent,
  });
}

export function PushNotificationSetup({ publicKey }: { publicKey: string | null }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function inspect() {
      if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }

      if (Notification.permission !== "granted") {
        if (!cancelled) setStatus("default");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await persistSubscription(existing);
          if (!cancelled) setStatus("enabled");
        } else if (!cancelled) {
          setStatus("default");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void inspect();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey),
        });
      }

      await persistSubscription(subscription);
      setStatus("enabled");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking" || status === "enabled" || status === "unsupported") return null;

  return (
    <section className="card border-[var(--rcg-green)]/20 bg-[var(--rcg-green-mist)] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-kicker">Safety notifications</p>
          <h2 className="text-lg font-black text-[var(--rcg-green-dark)]">
            {status === "denied" ? "Notifications are blocked on this device" : "Enable after-hours presence checks"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--rcg-muted)]">
            {status === "denied"
              ? "If RCG needs you to confirm whether you are still on site, the system will fall back to email."
              : "Allow notifications so RCG can ask you to confirm your site status after hours. Management only receives on-site, off-site or unresolved — not your exact location."}
          </p>
        </div>

        {status !== "denied" ? (
          <button className="btn btn-secondary shrink-0" type="button" onClick={() => void enable()} disabled={busy}>
            {busy ? "Enabling…" : status === "error" ? "Try again" : "Enable notifications"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
