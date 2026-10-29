"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { StatusPill } from "@/components/StatusPill";
import { isToday, pkr, time } from "@/lib/format";
import type { Parcel } from "@/lib/types";
import { useRider } from "@/lib/useRider";

type Filter = "all" | "out" | "handed" | "delivered" | "returned";

export default function ParcelsPage() {
  const { state, rider } = useRider();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  if (!rider) return null;

  const today = state.parcels.filter(
    (p) => p.riderId === rider.id && (p.status === "out" || p.status === "handed" || (p.attempt && isToday(p.attempt.at)))
  );
  const isReturn = (p: Parcel) => p.status === "returned" || p.status === "received";
  const count = {
    all: today.length,
    out: today.filter((p) => p.status === "out").length,
    handed: today.filter((p) => p.status === "handed").length,
    delivered: today.filter((p) => p.status === "delivered").length,
    returned: today.filter(isReturn).length,
  };
  const match = (p: Parcel) => {
    if (filter === "returned" && !isReturn(p)) return false;
    if (filter !== "all" && filter !== "returned" && p.status !== filter) return false;
    const s = q.trim().toLowerCase();
    return !s || [p.customer, p.address, p.trk, p.id].some((x) => x.toLowerCase().includes(s));
  };
  const list = today.filter(match);
  const groups: { title: string; items: Parcel[] }[] = [
    { title: "On the road", items: list.filter((p) => p.status === "out") },
    { title: "Handed to you, scan to start", items: list.filter((p) => p.status === "handed") },
    { title: "Closed today", items: list.filter((p) => p.attempt).sort((a, b) => b.attempt!.at - a.attempt!.at) },
  ].filter((g) => g.items.length);

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: `All ${count.all}` },
    { key: "out", label: `Live ${count.out}` },
    { key: "handed", label: `To scan ${count.handed}` },
    { key: "delivered", label: `Delivered ${count.delivered}` },
    { key: "returned", label: `Returned ${count.returned}` },
  ];

  const href = (p: Parcel) =>
    p.status === "out" ? `/rider/ride/${encodeURIComponent(p.trk)}` : p.status === "handed" ? "/rider/scan" : undefined;

  return (
    <>
      <div className="topbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
        <div className="row between" style={{ alignItems: "baseline" }}>
          <h1>Parcels</h1>
          <span className="small muted">Today · {count.all} assigned</span>
        </div>
        <div className="row" style={{ background: "var(--ground)", borderRadius: 12, padding: "0 12px", minHeight: 46 }}>
          <Icon name="search" size={18} color="var(--muted)" />
          <label htmlFor="pc-q" className="sr-only">Search parcels</label>
          <input id="pc-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, area or tracking ID" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", minHeight: 44 }} />
        </div>
        <div className="row" style={{ gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {chips.map((c) => (
            <button key={c.key} type="button" className="chip" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="phone-main">
        {groups.length === 0 && <div className="empty">No parcels match.</div>}
        {groups.map((g) => (
          <section key={g.title} className="stack" style={{ gap: 8 }}>
            <h2 className="xs" style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>{g.title}</h2>
            {g.items.map((p) => {
              const body = (
                <>
                  <span className="row between">
                    <span style={{ fontWeight: 600 }}>{p.customer}</span>
                    <StatusPill status={p.status} label={p.status === "out" ? "Live" : p.status === "handed" ? "Not scanned" : undefined} />
                  </span>
                  <span className="small muted">{p.address}</span>
                  <span className="row between">
                    <span className="mono xs muted">{p.trk} · {p.attempt ? time(p.attempt.at) : time(p.rideStartedAt ?? p.createdAt)}</span>
                    <span className="num" style={{ fontWeight: 600 }}>{pkr(p.cod)}</span>
                  </span>
                  {p.attempt?.reason && <span className="xs" style={{ color: "var(--red)" }}>{p.attempt.reason}</span>}
                </>
              );
              const h = href(p);
              const style = { display: "flex", flexDirection: "column" as const, gap: 6, textDecoration: "none", color: "var(--ink)", borderRadius: 12 };
              return h ? (
                <Link key={p.id} href={h} className="card" style={style}>{body}</Link>
              ) : (
                <div key={p.id} className="card" style={style}>{body}</div>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}
