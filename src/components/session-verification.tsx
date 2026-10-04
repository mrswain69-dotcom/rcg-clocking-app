import {
  verificationMilestones,
  sessionVerificationLabel,
  type VerificationEvidence,
} from "@/lib/verification";
import { formatUkDateTime } from "@/lib/dates";
export function SessionVerification({
  evidence,
}: {
  evidence: VerificationEvidence;
}) {
  return (
    <div className="session-verification">
      <strong className="text-xs">{sessionVerificationLabel(evidence)}</strong>
      <div className="verification-milestones">
        {verificationMilestones(evidence).map((m) => (
          <details
            className={`verification-milestone verification-${m.tone}`}
            key={m.key}
          >
            <summary
              aria-label={`${m.label}: ${m.tone === "green" ? "confirmed" : m.tone === "amber" ? "uncertain" : m.tone === "red" ? "outside site" : "unconfirmed"}`}
            >
              <span aria-hidden="true">{m.symbol}</span>
              <small>{m.label}</small>
            </summary>
            <p>{m.detail}</p>
          </details>
        ))}
      </div>
      {evidence.last_location_status ? (
        <p className="mt-1 text-xs">
          Latest check: {evidence.last_location_status.replaceAll("_", " ")} ·{" "}
          {formatUkDateTime(evidence.last_presence_check_at)}
        </p>
      ) : null}
    </div>
  );
}
