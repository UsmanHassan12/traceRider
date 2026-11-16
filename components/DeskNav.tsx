"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { cashInHand, useStore } from "@/lib/store";

/** Left rail of the warehouse desk: Dispatch, Returns, Cash, and Admin for admins. */
export function DeskNav() {
  const { state, me, signOut } = useStore();
  const path = usePathname();
  const ridersOwing = state.riders.filter((r) => cashInHand(state, r.id).inHand > 0).length;

  const comingBack = state.parcels.filter((p) => p.status === "returned").length;

  const item = (href: string, label: string, icon: "scan" | "cash" | "undo", badge?: number) => {
    const active = path === href;
    return (
      <Link href={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} style={{ position: "relative" }}>
        <Icon name={icon} size={22} />
        {label}
        {!!badge && (
          <span style={{ position: "absolute", top: 4, right: 6, minWidth: 18, height: 18, borderRadius: 99, background: "#fff", color: "var(--red)", fontSize: 10.5, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 5px" }}>
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav aria-label="Desk" className="wh-nav">
      <Link href="/" aria-label="Home" className="logo">
        <Icon name="box" size={22} stroke={2.2} />
      </Link>
      {item("/warehouse", "Dispatch", "scan")}
      {item("/warehouse/returns", "Returns", "undo", comingBack || undefined)}
      {item("/warehouse/cash", "Cash", "cash", ridersOwing || undefined)}
      {me?.role === "admin" && (
        <Link href="/admin"><Icon name="grid" size={22} />Admin</Link>
      )}
      <button type="button" className="signout" onClick={() => signOut()}>
        <Icon name="logout" size={22} />Sign out
      </button>
    </nav>
  );
}
