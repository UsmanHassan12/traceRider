"use client";

import { Pager, usePaged } from "@/components/Pager";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { isToday, pkr, time } from "@/lib/format";
import { cashInHand } from "@/lib/store";
import type { Deposit } from "@/lib/types";
import { useToast } from "@/components/Toast";
import { useRider } from "@/lib/useRider";

export default function CashPage() {
  const { state, rider, answerDeposit } = useRider();
  const toast = useToast();
  const [request, setRequest] = useState<{ id: string; declared: number } | null>(null);
  const [answering, setAnswering] = useState<Deposit | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const rid = rider?.id ?? "";
  const collectedRows = state.parcels
    .filter((p) => p.riderId === rid && p.status === "delivered" && p.attempt && isToday(p.attempt.at))
    .map((p) => ({ at: p.attempt!.at, title: `${p.customer} · ${p.trk}`, sub: `Collected ${time(p.attempt!.at)} · ${p.area}`, amount: p.cod, kind: "in" as const, dep: undefined as Deposit | undefined }));
  const depositRows = state.deposits
    .filter((d) => d.riderId === rid && isToday(d.at))
    .map((d) => ({ at: d.at, title: "Deposited at warehouse", sub: `${time(d.at)} · counted by ${d.by}`, amount: d.amount, kind: "out" as const, dep: d as Deposit | undefined }));
  const rows = [...collectedRows, ...depositRows].sort((a, b) => b.at - a.at);
  const pgA = usePaged(rows, 10);
  if (!rider) return null;

  const cash = cashInHand(state, rider.id);
  const waiting = state.deposits.filter((d) => d.riderId === rider.id && d.status === "pending").sort((a, b) => b.at - a.at);
  const result = request ? state.deposits.find((d) => d.requestId === request.id) : undefined;

  function openRequest() {
    const id = Math.random().toString(36).slice(2, 10).toUpperCase();
    setRequest({ id, declared: cash.inHand });
  }

  async function answer(d: Deposit, accept: boolean) {
    if (!accept && !note.trim()) return toast("Write what happened, for example how much you actually handed over.", "bad");
    setBusy(true);
    const r = await answerDeposit(d, accept, note);
    setBusy(false);
    toast(r.message, r.ok ? (accept ? "good" : "plain") : "bad");
    if (r.ok) {
      setAnswering(null);
      setDisputing(false);
      setNote("");
      if (!accept) setRequest(null); // the dispute now waits for the admin
    }
  }

  const statusPill = (d?: Deposit) => {
    if (!d) return null;
    if (d.status === "pending") return <span className="pill warn">Check amount</span>;
    if (d.status === "disputed") return <span className="pill bad">Disputed</span>;
    if (d.status === "resolved") return <span className="pill info">Resolved</span>;
    return <span className="pill good">Confirmed</span>;
  };

  return (
    <>
      <div style={{ background: "var(--navy)", color: "#fff", padding: "22px 18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <h1 style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>Cash</h1>
        <div>
          <div className="small" style={{ color: "#cfdbee" }}>Cash in hand</div>
          <div className="num" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{pkr(cash.inHand)}</div>
          {cash.carried > 0 && <div className="xs" style={{ color: "#ffd479", marginTop: 2 }}>Includes {pkr(cash.carried)} not deposited on earlier days</div>}
        </div>
      </div>

      <div className="phone-main">
        {waiting.map((d) => (
          <section key={d.id ?? d.at} className="card" style={{ borderRadius: 14, border: "2px solid #f0d3a6", background: "#fffaf0", display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="row" style={{ gap: 8, color: "var(--amber-ink)", fontWeight: 600 }}>
              <Icon name="info" size={18} /> Check this deposit
            </div>
            <div className="small">
              {d.by} recorded <b className="num">{pkr(d.amount)}</b> from you at {time(d.at)}
              {d.declared !== undefined ? <> (you declared <b className="num">{pkr(d.declared)}</b>)</> : null}.
            </div>
            <button type="button" className="btn navy" onClick={() => { setAnswering(d); setDisputing(false); setNote(""); }}>Accept or dispute</button>
          </section>
        ))}

        <div className="grid2">
          <div className="card"><div className="xs muted">Collected today</div><div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{pkr(cash.collected)}</div><div className="xs muted">{collectedRows.length} parcels</div></div>
          <div className="card"><div className="xs muted">Deposited today</div><div className="num" style={{ fontSize: 18, fontWeight: 700, color: "var(--green)" }}>{pkr(cash.deposited)}</div><div className="xs muted">{depositRows.length} deposit{depositRows.length === 1 ? "" : "s"}</div></div>
        </div>

        <button type="button" onClick={openRequest} disabled={cash.inHand <= 0} className="row" style={{ gap: 12, background: cash.inHand > 0 ? "var(--red)" : "var(--line-2)", color: cash.inHand > 0 ? "#fff" : "var(--muted)", border: 0, borderRadius: 14, padding: "12px 16px", minHeight: 60, cursor: cash.inHand > 0 ? "pointer" : "default", textAlign: "left" }}>
          <Icon name="qr" size={26} />
          <span className="grow">
            <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>Hand in cash at warehouse</span>
            <span className="xs" style={{ display: "block", opacity: 0.85 }}>{cash.inHand > 0 ? "Shows a code for the desk to scan" : "No cash to hand in"}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>

        <section className="card" style={{ padding: "6px 14px", borderRadius: 14 }}>
          <div className="row between" style={{ padding: "8px 0", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 14 }}>Today&apos;s activity</h2>
            <span className="xs muted">Newest first</span>
          </div>
          {rows.length === 0 && <div className="small muted" style={{ padding: "10px 0" }}>No cash collected yet today.</div>}
          {pgA.rows.map((r, i) => (
            <div key={i} className="row" style={{ gap: 10, padding: "9px 0", borderTop: "1px solid #eef1f5" }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700, flex: "none", background: r.kind === "in" ? "var(--green-soft)" : "var(--navy-soft)", color: r.kind === "in" ? "var(--green)" : "var(--navy)" }}>
                {r.kind === "in" ? "+" : "−"}
              </span>
              <span className="grow">
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 500 }}>{r.title}</span>
                <span className="xs muted" style={{ display: "block" }}>{r.sub}</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                <span className="num" style={{ fontWeight: 600, fontSize: 13.5, color: r.kind === "in" ? "var(--ink)" : "var(--navy)" }}>
                  {r.kind === "in" ? "+ " : "− "}{pkr(r.amount)}
                </span>
                {statusPill(r.dep)}
              </span>
            </div>
          ))}
          <div style={{ padding: "8px 0 4px" }}><Pager {...pgA} compact label="activity" /></div>
        </section>
      </div>

      {request && (
        <div className="overlay">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dep-title" style={{ alignItems: "center", textAlign: "center" }}>
            {!result ? (
              <>
                <h2 id="dep-title">Hand in {pkr(request.declared)}</h2>
                <div className="small muted">Give the cash to the warehouse desk and let them scan this code. Keep this screen open: it updates when they mark it received.</div>
                <div style={{ background: "#fff", padding: 12, borderRadius: 12, border: "1px solid var(--line)" }}>
                  <QRCodeSVG value={`DEPOSIT|${rider.id}|${request.declared}|${request.id}`} size={210} level="M" />
                </div>
                <div className="mono xs muted">{rider.name} · code {request.id}</div>
                <div className="row small muted" style={{ gap: 8 }}><span className="dot-pulse" aria-hidden="true" /> Waiting for the warehouse…</div>
                <button type="button" className="btn" style={{ width: "100%" }} onClick={() => setRequest(null)}>Cancel</button>
              </>
            ) : result.status === "pending" ? (
              <>
                <h2 id="dep-title">Amounts don&apos;t match</h2>
                <div className="grid2" style={{ width: "100%" }}>
                  <div className="tile"><div className="xs muted">You declared</div><div className="num" style={{ fontWeight: 700, fontSize: 20 }}>{pkr(result.declared ?? request.declared)}</div></div>
                  <div className="tile" style={{ background: "var(--amber-soft)" }}><div className="xs muted">Desk counted</div><div className="num" style={{ fontWeight: 700, fontSize: 20 }}>{pkr(result.amount)}</div></div>
                </div>
                <div className="small muted">Recorded by {result.by}. If the desk&apos;s count is right, accept it. The difference stays on your balance.</div>
                <button type="button" className="btn red" style={{ width: "100%" }} onClick={() => { setAnswering(result); setDisputing(true); setNote(""); }}>Dispute</button>
                <button type="button" className="btn green" style={{ width: "100%" }} disabled={busy} onClick={() => answer(result, true)}>Accept {pkr(result.amount)}</button>
              </>
            ) : (
              <>
                <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--green-soft)", color: "var(--green)", display: "grid", placeItems: "center" }}>
                  <Icon name="check" size={34} stroke={2.6} />
                </span>
                <h2 id="dep-title">Received {pkr(result.amount)}</h2>
                <div className="small muted">Counted by {result.by} at {time(result.at)}. Your cash in hand is now {pkr(cash.inHand)}.</div>
                <button type="button" className="btn navy" style={{ width: "100%" }} onClick={() => setRequest(null)}>Done</button>
              </>
            )}
          </div>
        </div>
      )}

      {answering && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setAnswering(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ans-title">
            <h2 id="ans-title">{disputing ? "Dispute this deposit" : "Check this deposit"}</h2>
            <div className="grid2">
              <div className="tile"><div className="xs muted">You declared</div><div className="num" style={{ fontWeight: 700, fontSize: 18 }}>{answering.declared !== undefined ? pkr(answering.declared) : "Not declared"}</div></div>
              <div className="tile" style={{ background: "var(--amber-soft)" }}><div className="xs muted">Desk counted</div><div className="num" style={{ fontWeight: 700, fontSize: 18 }}>{pkr(answering.amount)}</div></div>
            </div>
            <div className="small muted">Recorded by {answering.by} at {time(answering.at)}.</div>
            {disputing ? (
              <>
                <div className="field">
                  <label htmlFor="dep-note">What happened?</label>
                  <input id="dep-note" className="input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I handed over Rs 18,450 in 500 notes" />
                </div>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="btn" onClick={() => setDisputing(false)}>Back</button>
                  <button type="button" className="btn red" disabled={busy} onClick={() => answer(answering, false)}>Send dispute to admin</button>
                </div>
              </>
            ) : (
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn red" onClick={() => setDisputing(true)}>Dispute</button>
                <button type="button" className="btn green" disabled={busy} onClick={() => answer(answering, true)}>Accept</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
