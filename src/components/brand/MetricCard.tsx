type Props = {
  icon: string;
  label: string;
  value: string;
  detail?: string;
  tone?: "green" | "orange" | "neutral";
};

export function MetricCard({ icon, label, value, detail, tone = "green" }: Props) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <div className="metric-icon" aria-hidden="true">{icon}</div>
      <div>
        <p className="metric-label">{label}</p>
        <p className="metric-value">{value}</p>
        {detail ? <p className="metric-detail">{detail}</p> : null}
      </div>
      <span className="metric-leaves" aria-hidden="true" />
    </article>
  );
}
