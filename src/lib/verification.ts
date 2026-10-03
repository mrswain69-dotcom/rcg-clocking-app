export type VerificationEvidence = {
  clock_in_at?: string | null;
  clock_in_method?: string | null;
  clock_in_location_status?: string | null;
  clock_out_at?: string | null;
  clock_out_location_status?: string | null;
  first_on_site_verified_at?: string | null;
  first_off_site_verified_at?: string | null;
  last_presence_check_at?: string | null;
  last_location_status?: string | null;
};
export type Milestone = {
  key: string;
  symbol: string;
  label: string;
  tone: "green" | "amber" | "grey" | "red";
  detail: string;
};
const time = (v?: string | null) =>
  v
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(v))
    : "";
const verified = (status?: string | null) =>
  status === "on_site_verified" || status === "kiosk_verified";
function tone(status?: string | null): Milestone["tone"] {
  if (verified(status)) return "green";
  if (status === "outside_site") return "red";
  if (status === "near_boundary" || status === "location_uncertain")
    return "amber";
  return "grey";
}
export function verificationMilestones(s: VerificationEvidence): Milestone[] {
  const onSite =
    verified(s.clock_in_location_status) ||
    Boolean(s.first_on_site_verified_at);
  const offSite =
    s.clock_out_location_status === "outside_site" ||
    Boolean(s.first_off_site_verified_at);
  return [
    {
      key: "arrival",
      symbol: "→",
      label: "Clock-in on site",
      tone: tone(s.clock_in_location_status),
      detail: verified(s.clock_in_location_status)
        ? `Confirmed on site at clock-in ${time(s.clock_in_at)}`
        : `Clock-in reading: ${(s.clock_in_location_status ?? "not available").replaceAll("_", " ")}`,
    },
    {
      key: "presence",
      symbol: "✓",
      label: "On-site presence",
      tone: onSite
        ? "green"
        : tone(s.last_location_status ?? s.clock_in_location_status),
      detail: onSite
        ? `On-site presence verified ${time(s.first_on_site_verified_at ?? s.clock_in_at)}. This does not establish continuous presence.`
        : "On-site presence has not been verified.",
    },
    {
      key: "departure",
      symbol: "↗",
      label: "Off-site departure",
      tone: offSite
        ? "green"
        : !s.clock_out_at
          ? "grey"
          : ["location_uncertain", "near_boundary"].includes(
                s.clock_out_location_status ?? "",
              )
            ? "amber"
            : "grey",
      detail: offSite
        ? `Off-site departure verified ${time(s.first_off_site_verified_at ?? s.clock_out_at)}${s.clock_out_location_status === "outside_site" ? " at clock-out" : " after clock-out"}`
        : !s.clock_out_at
          ? "Not clocked out yet."
          : "Off-site departure unconfirmed. Clocking out while still on site is allowed.",
    },
  ];
}
export function sessionVerificationLabel(s: VerificationEvidence) {
  return verificationMilestones(s)[1].tone === "green"
    ? "On-site presence verified"
    : "On-site presence unconfirmed";
}
export function nextLocationCheck(
  s: {
    clock_out_at: string | null;
    first_on_site_verified_at: string | null;
    first_off_site_verified_at: string | null;
    current_presence_source?: string | null;
  },
  periodic: boolean,
  now: number,
  attempted: number,
): "arrival" | "periodic" | "departure" | null {
  if (s.clock_out_at)
    return !s.first_off_site_verified_at &&
      now < Date.parse(s.clock_out_at) + 15 * 60000 &&
      now - Math.max(attempted, Date.parse(s.clock_out_at)) >= 60000
      ? "departure"
      : null;
  if (
    !s.first_on_site_verified_at &&
    s.current_presence_source !== "user_working_off_site"
  )
    return now - attempted >= 60000 ? "arrival" : null;
  return periodic && now - attempted >= 15 * 60000 ? "periodic" : null;
}
