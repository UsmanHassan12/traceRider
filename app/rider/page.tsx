"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { ago, initials, isToday, pkr } from "@/lib/format";
import { RULES } from "@/lib/rules";
import { cashInHand } from "@/lib/store";
import { useRider } from "@/lib/useRider";

export default function RiderHome() {
  const { state, rider } = useRider();
  const [onDuty, setOnDuty] = useState(true);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  if (!rider) return null;

  const mine = state.parcels.filter((p) => p.riderId === rider.id);
  const live = mine.filter((p) => p.status === "out").sort((a, b) => (a.rideStartedAt ?? 0) - (b.rideStartedAt ?? 0));
  const waiting = mine.filter((p) => p.status === "handed");
  const closedToday = mine.filter((p) => p.attempt && isToday(p.attempt.at));
  const delivered = closedToday.filter((p) => p.attempt!.outcome === "delivered").length;
  const returned = closedToday.length - delivered;
  const cash = cashInHand(state, rider.id);
  const pct = Math.min(100, Math.round((cash.inHand / RULES.cashLimit) * 100));
  const first = rider.name.split(" ")[0];

  return (
    <>
      <div style={{ background: "var(--red)", color: "#fff", padding: "22px 18px 58px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row between">
          <div className="row" style={{ gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", color: "var(--red)", fontWeight: 700, display: "grid", placeItems: "center" }}>{initials(rider.name)}</div>
            <div>
              <div className="xs" style={{ color: "#f7d9d9" }}>Assalam o Alaikum</div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{rider.name}</div>
            </div>
          </div>
          <button
            type="button"
            aria-pressed={onDuty}
            onClick={() => setOnDuty(!onDuty)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,.22)", color: "#fff", border: 0, borderRadius: 99, padding: "6px 6px 6px 14px", minHeight: 44, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            {onDuty ? "On duty" : "Off duty"}
            <span style={{ width: 44, height: 26, borderRadius: 99, background: onDuty ? "#3fbf7f" : "rgba(255,255,255,.35)", position: "relative", display: "block" }}>
              <span style={{ position: "absolute", top: 3, left: onDuty ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </span>
          </button>
        </div>
        <div className="xs mono" style={{ color: "#f7d9d9" }}>{rider.bike.split("· ")[1] ?? rider.bike} · {rider.id}</div>
      </div>

      <div className="card" style={{ margin: "-44px 16px 0", borderRadius: 16, boxShadow: "0 6px 22px rgba(31,43,61,.10)", border: 0, display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div>
            <div className="xs muted">Cash in hand</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15 }}>{pkr(cash.inHand)}</div>
          </div>
          <div className="xs muted" style={{ textAlign: "right" }}>
            Deposit limit<br />
            <b style={{ color: "var(--ink)" }}>{pkr(RULES.cashLimit)}</b>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "#eef1f5", overflow: "hidden" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cash limit used">
          <div style={{ width: `${pct}%`, height: "100%", background: pct > 90 ? "var(--red)" : "var(--navy)", borderRadius: 4 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", borderTop: "1px solid #eef1f5", paddingTop: 12, textAlign: "center" }}>
          <div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--green)" }}>{delivered}</div><div className="xs muted">Delivered</div></div>
          <div style={{ borderLeft: "1px solid #eef1f5", borderRight: "1px solid #eef1f5" }}><div style={{ fontSize: 20, fontWeight: 700, color: "var(--amber)" }}>{returned}</div><div className="xs muted">Returned</div></div>
          <div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)" }}>{live.length}</div><div className="xs muted">Live rides</div></div>
        </div>
      </div>

      <div className="phone-main">
        <Link href="/rider/scan" className="btn navy xl" style={{ minHeight: 64, fontSize: 17 }}>
          <Icon name="scan" size={26} /> Scan parcel QR
        </Link>

        <section className="stack" style={{ gap: 10 }}>
          <div className="row between" style={{ alignItems: "baseline" }}>
            <h2 style={{ fontSize: 15 }}>Live rides</h2>
            <span className="xs muted">Oldest first</span>
          </div>
          {live.length === 0 && <div className="empty">No live rides. Scan a parcel to start one.</div>}
          {live.map((p) => (
            <Link key={p.id} href={`/rider/ride/${encodeURIComponent(p.trk)}`} className="card" style={{ textDecoration: "none", color: "var(--ink)", display: "flex", flexDirection: "column", gap: 8, borderRadius: 14 }}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{p.customer}</div>
                  <div className="small muted">{p.address}</div>
                </div>
                <span className="pill info">Live · {ago(p.rideStartedAt ?? Date.now())}</span>
              </div>
              <div className="row between">
                <span className="mono xs muted">{p.trk}</span>
                <span className="num" style={{ fontWeight: 700 }}>{pkr(p.cod)}</span>
              </div>
            </Link>
          ))}
        </section>

        {waiting.length > 0 && (
          <Link href="/rider/parcels" className="row" style={{ gap: 10, background: "var(--amber-soft)", color: "var(--amber-ink)", borderRadius: 12, padding: "12px 14px", textDecoration: "none" }}>
            <Icon name="box" />
            <span className="grow small"><b>{waiting.length} parcel{waiting.length > 1 ? "s" : ""}</b> handed to you {waiting.length > 1 ? "are" : "is"} not scanned yet</span>
            <Icon name="chevron" size={18} />
          </Link>
        )}
      </div>
    </>
  );
}
