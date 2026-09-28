import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireAdminProfile } from "@/lib/auth";
import { formatUkDateTime } from "@/lib/dates";
import { KioskDeviceEnrolment } from "./kiosk-device-enrolment";
import { renameKioskDevice, revokeKioskDevice } from "./actions";

export const metadata: Metadata = { title: "Kiosk devices" };

export default async function KioskDevicesPage() {
  const { supabase } = await requireAdminProfile();

  const { data } = await supabase
    .from("kiosk_devices")
    .select("id,label,is_active,enrolled_at,last_seen_at,revoked_at,user_agent")
    .order("enrolled_at", { ascending: false });

  const devices = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Kiosk devices"
        description="Only devices enrolled here can create kiosk-verified attendance."
        action={<Link className="btn btn-secondary" href="/admin">← Admin</Link>}
      />

      <KioskDeviceEnrolment />

      <section className="card p-5 sm:p-6">
        <div className="mb-4">
          <p className="section-kicker">Trusted devices</p>
          <h2 className="text-2xl font-black">Registered kiosks</h2>
          <p className="mt-1 text-sm text-[var(--rcg-muted)]">
            Revoke a device immediately if the tablet/computer is lost, replaced or should no longer be trusted.
          </p>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Device</th><th>Status</th><th>Enrolled</th><th>Last seen</th><th>Actions</th></tr></thead>
            <tbody>
              {devices.length ? devices.map((device) => (
                <tr key={device.id}>
                  <td>
                    <strong>{device.label}</strong>
                    <div className="mt-1 max-w-md truncate text-xs text-[var(--rcg-muted)]">{device.user_agent ?? "—"}</div>
                  </td>
                  <td><span className={"badge " + (device.is_active ? "" : "!bg-slate-100 !text-slate-600")}>{device.is_active ? "Active" : "Revoked"}</span></td>
                  <td>{formatUkDateTime(device.enrolled_at)}</td>
                  <td>{device.last_seen_at ? formatUkDateTime(device.last_seen_at) : "Never"}</td>
                  <td>
                    {device.is_active ? (
                      <div className="flex flex-wrap gap-2">
                        <details>
                          <summary className="cursor-pointer text-sm font-extrabold text-[var(--rcg-green-dark)]">Rename…</summary>
                          <form action={renameKioskDevice} className="mt-2 flex min-w-64 gap-2">
                            <input type="hidden" name="deviceId" value={device.id} />
                            <input className="input !min-h-9 !py-1" name="label" defaultValue={device.label} maxLength={80} required />
                            <button className="btn btn-soft !min-h-9 !px-3" type="submit">Save</button>
                          </form>
                        </details>
                        <form action={revokeKioskDevice}>
                          <input type="hidden" name="deviceId" value={device.id} />
                          <button className="btn btn-danger !min-h-9 !px-3" type="submit">Revoke</button>
                        </form>
                      </div>
                    ) : <span className="text-xs font-bold text-[var(--rcg-muted)]">{device.revoked_at ? "Revoked " + formatUkDateTime(device.revoked_at) : "Revoked"}</span>}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="text-[var(--rcg-muted)]">No kiosk devices have been enrolled yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
