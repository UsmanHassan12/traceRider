"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { QrScanner } from "@/components/QrScanner";
import { isToPick } from "@/lib/custody";
import { pkr } from "@/lib/format";
import { useRider } from "@/lib/useRider";

type Last = { ok: boolean; title: string; sub?: string } | null;

/**
 * Pickup at the warehouse: the rider scans every box the desk assigned to him. Each scan only
 * confirms he has the box; the camera stays open for the next one. Deliveries start from Home.
 */
export default function ScanPage() {
  const { state, rider, pickUp } = useRider();
  const [last, setLast] = useState<Last>(null);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);

  if (!rider) return null;

  const assigned = state.parcels.filter((p) => p.riderId === rider.id && p.status === "handed");
  const toPick = assigned.filter(isToPick);
  const picked = assigned.length - toPick.length;

  function check(code: string, manual: boolean) {
    const r = pickUp(code, rider!.id, manual);
    const p = r.ok ? r.parcel : undefined;
    if (r.ok && navigator.vibrate) navigator.vibrate(60);
    setLast({
      ok: r.ok,
      title: r.message,
      sub: p ?`${p.customer} · ${p.area} · ${p.cod ? `collect ${pkr(p.cod)}` : "prepaid"}${manual ? " · typed, not scanned (noted)" : ""}` : undefined,
    });
    setTyped("");
  }

  const done = assigned.length > 0 && toPick.length === 0;

  return (
    <div style={{ position: "fixed", inset: 0, maxWidth: 480, margin: "0 auto", background: "#0e1522", display: "flex", flexDirection: "column" }}>
      <div className="row between" style={{ position: "absolute", left: 16, right: 16, top: 16, zIndex: 3 }}>
        <Link href="/rider" className="icon-btn" aria-label="Close scanner" style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>
          <Icon name="x" stroke={2.2} />
        </Link>
        <div style={{ color: "#fff", fontWeight: 600 }}>Pick up parcels</div>
        <span className="num" style={{ color: "#fff", fontWeight: 700, background: "rgba(255,255,255,.16)", borderRadius: 99, padding: "6px 12px" }}>
          {picked}/{assigned.length}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <QrScanner paused={done} onResult={(t) => check(t, false)} />
      </div>

      <div className="sheet" style={{ position: "relative", zIndex: 4, maxHeight: "60dvh", overflowY: "auto" }}>
        <div className="grabber" />

        <div className="stack" style={{ gap: 6 }}>
          <div className="row between small">
            <b>{done ? "All parcels picked up" : `${picked} of ${assigned.length} scanned`}</b>
            <span className="muted">{toPick.length} left</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "#eef1f5", overflow: "hidden" }} role="progressbar" aria-valuenow={picked} aria-valuemin={0} aria-valuemax={assigned.length} aria-label="Parcels picked up">
            <div style={{ width: `${assigned.length ? (picked / assigned.length) * 100 : 0}%`, height: "100%", background: "var(--green)", borderRadius: 4, transition: "width .2s" }} />
          </div>
        </div>

        {last && (
          <div role="status" className="row" style={{ alignItems: "flex-start", gap: 10, background: last.ok ? "var(--green-soft)" : "var(--red-tint)", border: `1px solid ${last.ok ? "#bfe3cf" : "#f0c9c6"}`, borderRadius: 12, padding: 12 }}>
            <span style={{ color: last.ok ? "var(--green)" : "var(--red)" }}><Icon name={last.ok ? "check" : "info"} stroke={2.6} /></span>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>{last.title}</div>
              {last.sub && <div className="xs muted">{last.sub}</div>}
            </div>
          </div>
        )}

        {assigned.length === 0 && <div className="small muted" style={{ textAlign: "center" }}>No parcels are assigned to you right now. The desk assigns them before you pick up.</div>}
        {!last && toPick.length > 0 && <div className="small muted" style={{ textAlign: "center" }}>Scan the QR on every box you take. The camera stays on for the next one.</div>}

        {done ? (
          <Link href="/rider" className="btn green xl">Done · choose your first delivery</Link>
        ) : (
          <>
            {typing ? (
              <form className="row" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) check(typed, true); }}>
                <label htmlFor="typed" className="sr-only">Tracking code</label>
                <input id="typed" className="input mono grow" autoFocus placeholder="e.g. RT1047-K7" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} />
                <button className="btn navy" type="submit">Add</button>
              </form>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setTyping(true)}>Label damaged? Type the code instead</button>
            )}
            {picked > 0 && <Link href="/rider" className="btn">Finish for now ({toPick.length} not scanned)</Link>}
          </>
        )}

        {toPick.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="xs muted" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Still to scan</div>
            {toPick.map((p) => (
              <div key={p.id} className="row between small" style={{ borderTop: "1px solid #eef1f5", paddingTop: 6 }}>
                <span style={{ minWidth: 0 }}>
                  <span className="mono" style={{ fontWeight: 600 }}>{p.trk}</span> · {p.customer}
                  <div className="xs muted">{p.area}</div>
                </span>
                <span className="num xs">{p.cod ? pkr(p.cod) : "Prepaid"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
