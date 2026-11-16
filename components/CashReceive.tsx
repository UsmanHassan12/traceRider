"use client";

import { useState } from "react";
import { initials, isToday, pkr } from "@/lib/format";
import { cashInHand, useStore } from "@/lib/store";

export interface CashTarget {
  riderId: string;
  requestId?: string; // one-time code from the rider's QR
  declared?: number; // what the rider says they are handing in
}

/**
 * The warehouse counts a rider's cash. With the rider's QR the amount is checked against what the
 * rider declared: equal = confirmed at once; different = the rider accepts or disputes on the phone.
 */
export function CashReceive({ target, onClose, onDone }: { target: CashTarget; onClose: () => void; onDone: (message: string) => void }) {
  const { state, deposit } = useStore();
  const [count, setCount] = useState(target.requestId && target.declared ? String(target.declared) : "");
  const [error, setError] = useState<string | null>(null);

  const r = state.riders.find((x) => x.id === target.riderId);
  const bal = cashInHand(state, target.riderId);
  const expected = bal.inHand;
  const declared = target.declared;
  const counted = Math.max(0, Math.round(Number(count.replace(/[^\d]/g, "")) || 0));
  const vs = declared !== undefined ? counted - declared : counted - expected;
  const deliveredToday = state.parcels.filter((p) => p.riderId === target.riderId && p.status === "delivered" && p.attempt && isToday(p.attempt.at) && p.cod > 0).length;

  function save() {
    const res = deposit(target.riderId, counted, target.requestId ? { requestId: target.requestId, declared: declared ?? counted } : undefined);
    if (!res.ok) return setError(res.message);
    onDone(`${pkr(counted)} received from ${r?.name ?? "rider"}. ${res.message}`);
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cash-title" style={{ width: "min(500px, 100%)" }}>
        <h2 id="cash-title">Receive cash</h2>
        <div className="row" style={{ gap: 12, background: "var(--ground)", borderRadius: 12, padding: 12 }}>
          <span className="avatar" style={{ width: 46, height: 46, fontSize: 15 }}>{initials(r?.name ?? "?")}</span>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{r?.name}</div>
            <div className="xs muted">{[r?.id, r?.bike, r?.phone].filter(Boolean).join(" · ")}</div>
            <div className="xs muted">{deliveredToday} COD deliveries today · {pkr(bal.collected)} collected today{bal.carried > 0 ? ` · ${pkr(bal.carried)} from earlier days` : ""}</div>
          </div>
          {target.requestId ? <span className="pill good">Rider&apos;s code</span> : <span className="pill warn">No rider code</span>}
        </div>
        <div className="grid2">
          <div className="tile">
            <div className="xs muted">{declared !== undefined ? "Rider says he is handing in" : "Rider hasn't declared"}</div>
            <div className="num" style={{ fontWeight: 700, fontSize: 22 }}>{declared !== undefined ? pkr(declared) : "—"}</div>
          </div>
          <div className="tile">
            <div className="xs muted">App says he holds</div>
            <div className="num" style={{ fontWeight: 700, fontSize: 22 }}>{pkr(expected)}</div>
          </div>
        </div>
        {declared !== undefined && declared !== expected && (
          <div className="xs" style={{ color: "var(--amber-ink)" }}>The rider&apos;s amount differs from the app by {pkr(Math.abs(declared - expected))}. Count carefully.</div>
        )}
        <div className="field">
          <label htmlFor="cash-count">Amount you counted</label>
          <input id="cash-count" className="input num" inputMode="numeric" autoFocus value={count} onChange={(e) => { setCount(e.target.value); setError(null); }} onKeyDown={(e) => e.key === "Enter" && counted > 0 && save()} placeholder={String(declared ?? expected)} style={{ fontSize: 22, fontWeight: 600 }} />
        </div>
        {counted > 0 && vs !== 0 && (
          <div className="small" style={{ color: vs < 0 ? "var(--red)" : "var(--amber-ink)" }}>
            {vs < 0 ? `${pkr(-vs)} less than ${declared !== undefined ? "the rider declared" : "the app expects"}.` : `${pkr(vs)} more than ${declared !== undefined ? "the rider declared" : "the app expects"}.`}{" "}
            The rider will be asked to accept or dispute it on his phone.
          </div>
        )}
        {!target.requestId && <div className="xs muted">Without the rider&apos;s QR, the rider confirms this amount on his phone afterwards.</div>}
        {error && <div className="small" style={{ color: "var(--red)" }}>{error}</div>}
        <div className="row wrap" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn green" disabled={counted <= 0} onClick={save}>
            Mark {pkr(counted)} received
          </button>
        </div>
      </div>
    </div>
  );
}
