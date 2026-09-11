import Link from "next/link";

type Props = {
  href?: string;
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ href = "/dashboard", compact = false, className = "" }: Props) {
  const content = (
    <span className={`brand-lockup ${compact ? "brand-lockup-compact" : ""} ${className}`.trim()}>
      <img className="brand-fox" src="/brand/staff-fox.svg" alt="Redcatch fox wearing a green staff shirt" />
      <span className="brand-copy">
        <span className="brand-name">Redcatch<br />Community Garden</span>
        <span className="brand-subtitle">Clocking app</span>
      </span>
    </span>
  );

  if (!href) return content;
  return <Link href={href} aria-label="Redcatch Community Garden Clocking App">{content}</Link>;
}
