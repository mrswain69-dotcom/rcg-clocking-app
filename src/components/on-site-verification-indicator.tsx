type VerificationState = "verified" | "unverified" | "unavailable";

function getState(
  clockInLocationStatus?: string | null,
  firstOnSiteVerifiedAt?: string | null,
): { state: VerificationState; label: string; detail: string } {
  if (
    firstOnSiteVerifiedAt
    || clockInLocationStatus === "on_site_verified"
    || clockInLocationStatus === "kiosk_verified"
  ) {
    return {
      state: "verified",
      label: "Verified on site",
      detail: "This session was verified as being on site.",
    };
  }

  if (["outside_site", "near_boundary", "location_uncertain"].includes(clockInLocationStatus ?? "")) {
    return {
      state: "unverified",
      label: "Unable to verify on site",
      detail: "The app did not verify this session as being on site.",
    };
  }

  return {
    state: "unavailable",
    label: "No location verification available",
    detail: "No usable location verification was available for this session.",
  };
}

export function OnSiteVerificationIndicator({
  clockInLocationStatus,
  firstOnSiteVerifiedAt,
}: {
  clockInLocationStatus?: string | null;
  firstOnSiteVerifiedAt?: string | null;
}) {
  const verification = getState(clockInLocationStatus, firstOnSiteVerifiedAt);

  return (
    <span className="verification-indicator">
      <button
        className={`verification-dot verification-dot-${verification.state}`}
        type="button"
        aria-label={verification.label}
      >
        ✓
      </button>
      <span className="verification-tooltip" role="tooltip">
        <strong>{verification.label}</strong>
        <span>{verification.detail}</span>
      </span>
    </span>
  );
}
