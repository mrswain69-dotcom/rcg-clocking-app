import Link from "next/link";
export function RegisterTabs({
  manager,
  active,
}: {
  manager: boolean;
  active: string;
}) {
  return (
    <nav aria-label="Register sections" className="flex flex-wrap gap-2">
      {[
        { id: "sessions", label: "Programmes & sessions" },
        ...(manager
          ? [
              { id: "clients", label: "Client directory" },
              { id: "contacts", label: "School / carer directory" },
            ]
          : []),
      ].map((t) => (
        <Link
          key={t.id}
          href={`/registers?tab=${t.id}`}
          aria-current={active === t.id ? "page" : undefined}
          className={`btn ${active === t.id ? "btn-primary" : "btn-secondary"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
