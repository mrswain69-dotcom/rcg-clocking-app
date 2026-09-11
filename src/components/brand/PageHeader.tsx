import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, action }: Props) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="section-kicker">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {action ? <div className="page-header-action">{action}</div> : null}
    </header>
  );
}
