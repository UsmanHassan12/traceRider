"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { RoleGate } from "@/components/RoleGate";
import { isToday } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate roles={["admin"]}>
      <Shell>{children}</Shell>
    </RoleGate>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { state, me, signOut } = useStore();
  const path = usePathname();
  const toReview = state.parcels.filter((p) => p.attempt?.outcome === "returned" && p.flags.length && !p.review && isToday(p.attempt.at)).length;
  const withRiders = state.parcels.filter((p) => p.status === "handed" || p.status === "out").length;

  const nav: { href: string; label: string; icon: IconName; badge?: number; tone?: "red" | "navy" }[] = [
    { href: "/admin", label: "Overview", icon: "grid" },
    { href: "/admin/orders", label: "Orders", icon: "box", badge: withRiders, tone: "navy" },
    { href: "/admin/review", label: "Returns review", icon: "flag", badge: toReview, tone: "red" },
    { href: "/admin/staff", label: "Staff & riders", icon: "users" },
    { href: "/warehouse", label: "Warehouse desk", icon: "printer" },
  ];

  return (
    <div className="adm">
      <aside className="adm-side">
        <Link href="/admin" className="row" style={{ gap: 10, padding: "0 6px", textDecoration: "none", color: "var(--ink)", flex: "none" }}>
          <span style={{ width: 36, height: 36, borderRadius: 9, background: "var(--red)", color: "#fff", display: "grid", placeItems: "center" }}>
            <Icon name="box" size={20} stroke={2.2} />
          </span>
          <span className="brand-text">
            <span style={{ display: "block", fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>Rider Trace</span>
            <span className="xs muted" style={{ display: "block" }}>Parcel custody</span>
          </span>
        </Link>
        <nav aria-label="Admin" className="adm-nav">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
              <Icon name={n.icon} size={18} />
              <span className="grow">{n.label}</span>
              {!!n.badge && (
                <span style={{ background: n.tone === "red" ? "var(--red)" : "var(--navy)", color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 99, padding: "1px 8px" }}>{n.badge}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="adm-foot">
          <div className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="xs muted who" style={{ wordBreak: "break-all" }}>{me?.email}</div>
            <button type="button" className="btn sm" onClick={() => signOut()} aria-label="Sign out">
              <Icon name="logout" size={16} /> <span className="who">Sign out</span>
            </button>
          </div>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
