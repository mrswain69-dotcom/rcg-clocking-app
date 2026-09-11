"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type MobileNavProps = {
  canViewOnSite: boolean;
  adminLike: boolean;
  developerLike: boolean;
};

export function MobileNav({ canViewOnSite, adminLike, developerLike }: MobileNavProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  const closeMore = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  useEffect(() => {
    closeMore();
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (!details?.open) return;
      if (!details.contains(event.target as Node)) details.open = false;
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMore();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <Link href="/dashboard" onClick={closeMore}><span className="mobile-nav-icon">⌂</span><span>Home</span></Link>
      <Link href="/history" onClick={closeMore}><span className="mobile-nav-icon">▤</span><span>History</span></Link>
      {canViewOnSite ? (
        <Link href="/on-site" onClick={closeMore}><span className="mobile-nav-icon">⌖</span><span>On Site</span></Link>
      ) : (
        <Link href="/account" onClick={closeMore}><span className="mobile-nav-icon">◎</span><span>Account</span></Link>
      )}

      <details className="mobile-more" ref={detailsRef}>
        <summary><span className="mobile-nav-icon">•••</span><span>More</span></summary>
        <div className="mobile-more-menu">
          {canViewOnSite ? <Link href="/account" onClick={closeMore}>◎ <span>Account</span></Link> : null}
          {adminLike ? (
            <>
              <div className="mobile-more-heading">Admin</div>
              <Link href="/admin" onClick={closeMore}>⚙ <span>Admin dashboard</span></Link>
              <Link href="/admin/users" onClick={closeMore}>♟ <span>Users</span></Link>
              <Link href="/admin/reports" onClick={closeMore}>▤ <span>Reports</span></Link>
              <Link href="/admin/alerts" onClick={closeMore}>⚠ <span>After-hours safety</span></Link>
              <Link href="/admin/audit" onClick={closeMore}>≡ <span>Audit log</span></Link>
            </>
          ) : null}
          {developerLike ? (
            <>
              <div className="mobile-more-heading">Technical</div>
              <Link href="/developer" onClick={closeMore}>⌘ <span>Developer diagnostics</span></Link>
            </>
          ) : null}
        </div>
      </details>
    </nav>
  );
}
