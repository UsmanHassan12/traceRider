"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { isToday, pkr, time } from "@/lib/format";
import { RULES } from "@/lib/rules";
import { cashInHand } from "@/lib/store";
import { useRider } from "@/lib/useRider";

export default function CashPage() {
  const { state, rider } = useRider();
  const [showCode, setShowCode] = useState(false);
  if (!rider) return null;

  const cash = cashInHand(state, rider.id);
  const pct = Math.min(100, Math.round((cash.inHand / RULES.cashLimit) * 100));
  const collectedRows = state.parcels
    .filter((p) => p.riderId === rider.id && p.status === "delivered" && p.attempt && isToday(p.attempt.at))
    .map((p) => ({ at: p.attempt!.at, title: `${p.customer} · ${p.trk}`, sub: `Collected ${time(p.attempt!.at)} · ${p.area}`, amount: p.cod, kind: "in" as const }));
  const depositRows = state.deposits
    .filter((d) => d.riderId === rider.id && isToday(d.at))
    .map((d) => ({ at: d.at, title: "Deposited at warehouse", sub: `${time(d.at)} · received by ${d.by}`, amount: d.amount, kind: "out" as const }));
  const rows = [...collectedRows, ...depositRows].sort((a, b) => b.at - a.at);
  const depositCode = `DEPOSIT|${rider.id}|${cash.inHand}|${new Date().toISOString().slice(0, 16)}`;

  return (
    <>
      <div style={{ background: "var(--navy)", color: "#fff", padding: "22px 18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <h1 style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>Cash</h1>
        <div>
          <div className="small" style={{ color: "#cfdbee" }}>Cash in hand</div>
          <div className="num" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{pkr(cash.inHand)}</div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.18)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct > 90 ? "#ff8a80" : "#f2b705", borderRadius: 4 }} />
          </div>
          <div className="row between xs" style={{ color: "#cfdbee" }}>
            <span>{pct}% of your {pkr(RULES.cashLimit)} limit</span>
            <span>{pkr(Math.max(0, RULES.cashLimit - cash.inHand))} left</span>
          </div>
        </div>
      </div>

      <div className="phone-main">
        <div className="grid2">
          <div className="card"><div className="xs muted">Collected today</div><div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{pkr(cash.collected)}</div><div className="xs muted">{collectedRows.length} parcels</div></div>
          <div className="card"><div className="xs muted">Deposited today</div><div className="num" style={{ fontSize: 18, fontWeight: 700, color: "var(--green)" }}>{pkr(cash.deposited)}</div><div className="xs muted">{depositRows.length} deposit{depositRows.length === 1 ? "" : "s"}</div></div>
        </div>

        <button type="button" onClick={() => setShowCode(true)} className="row" style={{ gap: 12, background: "var(--red)", color: "#fff", border: 0, borderRadius: 14, padding: "12px 16px", minHeight: 60, cursor: "pointer", textAlign: "left" }}>
          <Icon name="qr" size={26} />
          <span className="grow">
            <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>Deposit cash at warehouse</span>
            <span className="xs" style={{ display: "block", color: "#f7d9d9" }}>Show this code to the cashier to scan</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>

        <section className="card" style={{ padding: "6px 14px", borderRadius: 14 }}>
          <div className="row between" style={{ padding: "8px 0", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 14 }}>Today&apos;s activity</h2>
            <span className="xs muted">Newest first</span>
          </div>
          {rows.length === 0 && <div className="small muted" style={{ padding: "10px 0" }}>No cash collected yet today.</div>}
          {rows.map((r, i) => (
            <div key={i} className="row" style={{ gap: 10, padding: "9px 0", borderTop: "1px solid #eef1f5" }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700, background: r.kind === "in" ? "var(--green-soft)" : "var(--navy-soft)", color: r.kind === "in" ? "var(--green)" : "var(--navy)" }}>
                {r.kind === "in" ? "+" : "−"}
              </span>
              <span className="grow">
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 500 }}>{r.title}</span>
                <span className="xs muted" style={{ display: "block" }}>{r.sub}</span>
              </span>
              <span className="num" style={{ fontWeight: 600, fontSize: 13.5, color: r.kind === "in" ? "var(--ink)" : "var(--navy)" }}>
                {r.kind === "in" ? "+ " : "− "}{pkr(r.amount)}
              </span>
            </div>
          ))}
        </section>
      </div>

      {showCode && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowCode(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dep-title" style={{ alignItems: "center", textAlign: "center" }}>
            <h2 id="dep-title">Deposit {pkr(cash.inHand)}</h2>
            <div className="small muted">The warehouse desk scans this code, counts the cash and records it. The deposit then shows in your activity.</div>
            <div style={{ background: "#fff", padding: 12, borderRadius: 12, border: "1px solid var(--line)" }}>
              <QRCodeSVG value={depositCode} size={200} level="M" />
            </div>
            <div className="mono xs muted">{rider.id} · {rider.name}</div>
            <button type="button" className="btn navy" style={{ width: "100%" }} onClick={() => setShowCode(false)}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}
