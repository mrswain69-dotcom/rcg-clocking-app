import type { ReactNode } from "react";

type Props = {
  icon?: string;
  title: string;
  children?: ReactNode;
  copy?: ReactNode;
  quote?: string;
};

export function DecorativePanel({ icon = "🌱", title, children, copy, quote }: Props) {
  return (
    <aside className="decorative-panel">
      <div className="decorative-panel-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      <div className="decorative-panel-copy">{children ?? copy}</div>
      {quote ? <p className="decorative-quote">“{quote}”</p> : null}
      <span className="botanical-corner" aria-hidden="true" />
    </aside>
  );
}
