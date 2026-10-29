"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { isToday } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { ready, state } = useStore();
  const path = usePathname();
  const toReview = state.parcels.filter((p) => p.attempt?.outcome === "returned" && p.flags.length && !p.review && isToday(p.attempt.at)).length;

  const nav: { href: string; label: string; icon: IconName; badge?: number }[] = [
    { href: "/admin", label: "Overview", icon: "grid" },
    { href: "/admin/review", label: "Returns review", icon: "flag", badge: toReview },
    { href: "/warehouse", label: "Warehouse desk", icon: "printer" },
    { href: "/rider", label: "Rider app", icon: "scan" },
  ];

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexWrap: "wrap", background: "var(--ground)" }}>
      <aside style={{ flex: "1 1 220px", maxWidth: 248, background: "#fff", borderRight: "1px solid var(--line)", padding: "22px 16px", display: "flex", flexDirection: "column", gap: 22 }}>
        <Link href="/" className="row" style={{ gap: 10, padding: "0 6px", textDecoration: "none", color: "var(--ink)" }}>
          <span style={{ width: 36, height: 36, borderRadius: 9, background: "var(--red)", color: "#fff", display: "grid", placeItems: "center" }}>
            <Icon name="box" size={20} stroke={2.2} />
          </span>
          <span>
            <span style={{ display: "block", fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>Rider Trace</span>
            <span className="xs muted" style={{ display: "block" }}>Parcel custody</span>
          </span>
        </Link>
        <nav aria-label="Admin" className="stack" style={{ gap: 2 }}>
          {nav.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className="row"
                style={{ gap: 10, padding: "10px 12px", borderRadius: 8, textDecoration: "none", background: active ? "#fbeaea" : "transparent", color: active ? "var(--red)" : "var(--ink-2)", fontWeight: active ? 600 : 400 }}
              >
                <Icon name={n.icon} size={18} />
                <span className="grow">{n.label}</span>
                {!!n.badge && <span style={{ background: "var(--red)", color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 99, padding: "1px 8px" }}>{n.badge}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="card" style={{ marginTop: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="row small" style={{ fontWeight: 600 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />Shopify connected</div>
          <div className="xs muted">Demo store · sample orders</div>
        </div>
      </aside>
      <div style={{ flex: "999 1 560px", minWidth: 0 }}>{ready ? children : <div aria-busy="true" />}</div>
    </div>
  );
}
