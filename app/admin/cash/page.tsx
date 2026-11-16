"use client";

import { useState } from "react";
import { CashOnDate } from "@/components/CashOnDate";
import { Icon } from "@/components/Icon";
import { ymd } from "@/lib/history";
import { Pager, usePaged } from "@/components/Pager";
import { useToast } from "@/components/Toast";
import { initials, pkr, time } from "@/lib/format";
import { cashInHand, useStore } from "@/lib/store";
import type { Deposit } from "@/lib/types";

type Filter = "attention" | "disputed" | "pending" | "all";

export default function CashPage() {
  const { state, resolveDeposit } = useStore();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("attention");
  const [resolving, setResolving] = useState<Deposit | null>(null);
  const [note, setNote] = useState("");
  const todayKey = ymd(Date.now());
  const [viewDay, setViewDay] = useState(todayKey);

  const riderName = (id: string) => state.riders.find((r) => r.id === id)?.name ?? id;
  const today = new Date().toDateString();
  const isToday = (t: number) => new Date(t).toDateString() === today;

  const balances = state.riders
    .map((r) => ({ r, ...cashInHand(state, r.id) }))
    .sort((a, b) => b.inHand - a.inHand);
  const withRiders = balances.reduce((s, b) => s + b.inHand, 0);
  const depositedToday = state.deposits.filter((d) => isToday(d.at)).reduce((s, d) => s + d.amount, 0);

  const groups: Record<Filter, (d: Deposit) => boolean> = {
    attention: (d) => d.status === "disputed" || d.status === "pending",
    disputed: (d) => d.status === "disputed",
    pending: (d) => d.status === "pending",
    all: () => true,
  };
  const list = state.deposits.filter(groups[filter]).sort((a, b) => b.at - a.at);
  const pg = usePaged(list, 15, filter);
  const pgB = usePaged(balances, 10);
  const count = (f: Filter) => state.deposits.filter(groups[f]).length;

  async function resolve() {
    if (!resolving) return;
    const r = await resolveDeposit(resolving, note);
    toast(r.message, r.ok ? "good" : "bad");
    setResolving(null);
    setNote("");
  }

  const statusPill = (d: Deposit) =>
    d.status === "disputed" ? (
      <span className="pill bad">Disputed by rider</span>
    ) : d.status === "pending" ? (
      <span className="pill warn">Waiting for rider</span>
    ) : d.status === "resolved" ? (
      <span className="pill info">Resolved</span>
    ) : (
      <span className="pill good">Confirmed</span>
    );

  const tile = { background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column" as const, gap: 6 };

  return (
    <main className="adm-main">
      <div className="row between wrap" style={{ gap: 12, alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Cash</h1>
          <div className="small muted">COD each rider is holding, and every handover at the warehouse with both sides&apos; amounts.</div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <label htmlFor="acash-day" className="xs muted">Cash on</label>
          <input id="acash-day" type="date" className="input" value={viewDay} max={todayKey} onChange={(e) => setViewDay(e.target.value || todayKey)} style={{ width: "auto", minHeight: 42 }} />
          {viewDay !== todayKey && <button type="button" className="btn" onClick={() => setViewDay(todayKey)}>Back to today</button>}
        </div>
      </div>

      {viewDay !== todayKey ? <CashOnDate day={viewDay} /> : <>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }} className="num">
        <div style={tile}><span className="xs muted">Cash with riders now</span><span style={{ fontSize: 26, fontWeight: 700 }}>{pkr(withRiders)}</span></div>
        <div style={tile}><span className="xs muted">Handed in today</span><span style={{ fontSize: 26, fontWeight: 700, color: "var(--green)" }}>{pkr(depositedToday)}</span></div>
        <div style={{ ...tile, ...(count("disputed") ? { background: "var(--red)", color: "#fff", border: 0 } : {}) }}>
          <span className="xs" style={{ color: count("disputed") ? "#f7d9d9" : "var(--muted)" }}>Disputed handovers</span>
          <span style={{ fontSize: 26, fontWeight: 700 }}>{count("disputed")}</span>
        </div>
        <div style={tile}><span className="xs muted">Waiting for rider to confirm</span><span style={{ fontSize: 26, fontWeight: 700, color: count("pending") ? "var(--amber)" : undefined }}>{count("pending")}</span></div>
      </div>

      <div className="row wrap" style={{ gap: 16, alignItems: "flex-start" }}>
        <section className="card pad-lg stack" style={{ flex: "3 1 520px", minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h2>Handovers</h2>
            <div className="row" style={{ gap: 6, overflowX: "auto" }}>
              {([
                ["attention", "Needs attention"],
                ["disputed", "Disputed"],
                ["pending", "Waiting"],
                ["all", "All"],
              ] as [Filter, string][]).map(([f, l]) => (
                <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {l} {count(f)}
                </button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 720 }}>
              <thead>
                <tr><th>Rider</th><th>When</th><th>Rider declared</th><th>Desk counted</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {pg.rows.length === 0 && (
                  <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>{filter === "attention" ? "Nothing needs attention. Every handover is confirmed." : "No handovers here."}</td></tr>
                )}
                {pg.rows.map((d, i) => {
                  const diff = d.declared !== undefined ? d.amount - d.declared : 0;
                  return (
                    <tr key={d.id ?? `${d.at}-${i}`}>
                      <td>
                        <b>{riderName(d.riderId)}</b>
                        {d.riderNote && <div className="xs" style={{ color: "var(--red)", maxWidth: 260 }}>&ldquo;{d.riderNote}&rdquo;</div>}
                      </td>
                      <td className="small">{new Date(d.at).toLocaleDateString("en-PK", { day: "numeric", month: "short" })} {time(d.at)}<div className="xs muted">by {d.by}</div></td>
                      <td>{d.declared !== undefined ? pkr(d.declared) : <span className="xs muted">No code used</span>}</td>
                      <td>
                        <b>{pkr(d.amount)}</b>
                        {diff !== 0 && <div className="xs" style={{ color: diff < 0 ? "var(--red)" : "var(--amber-ink)" }}>{diff < 0 ? `${pkr(-diff)} short` : `${pkr(diff)} over`}</div>}
                      </td>
                      <td>
                        {statusPill(d)}
                        {d.resolvedBy && <div className="xs muted" style={{ marginTop: 3 }}>{d.resolvedBy}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {(d.status === "disputed" || d.status === "pending") && (
                          <button type="button" className="btn sm" onClick={() => { setResolving(d); setNote(""); }}>Resolve</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager {...pg} label="handovers" />
        </section>

        <section className="card pad-lg stack" style={{ flex: "2 1 300px", minWidth: 0 }}>
          <h2>Cash each rider holds</h2>
          {balances.length === 0 && <div className="small muted">No riders yet.</div>}
          {pgB.rows.map((b) => (
            <div key={b.r.id} className="row" style={{ gap: 10, paddingTop: 10, borderTop: "1px solid #eef1f5" }}>
              <span className="avatar">{initials(b.r.name)}</span>
              <span className="grow">
                <span style={{ display: "block", fontWeight: 600, fontSize: 13.5 }}>{b.r.name}</span>
                <span className="xs muted">{b.carried > 0 ? `${pkr(b.carried)} from earlier days` : `${pkr(b.collected)} collected today`}</span>
              </span>
              <b className="num" style={{ color: b.inHand > 0 ? "var(--ink)" : "var(--muted)" }}>{pkr(b.inHand)}</b>
            </div>
          ))}
          <Pager {...pgB} compact label="riders" />
        </section>
      </div>
      </>}

      {resolving && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setResolving(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rs-title">
            <h2 id="rs-title">Resolve handover · {riderName(resolving.riderId)}</h2>
            <div className="grid2">
              <div className="tile"><div className="xs muted">Rider declared</div><div className="num" style={{ fontWeight: 700, fontSize: 18 }}>{resolving.declared !== undefined ? pkr(resolving.declared) : "—"}</div></div>
              <div className="tile"><div className="xs muted">Desk counted ({resolving.by})</div><div className="num" style={{ fontWeight: 700, fontSize: 18 }}>{pkr(resolving.amount)}</div></div>
            </div>
            {resolving.riderNote && <div className="small">Rider says: &ldquo;{resolving.riderNote}&rdquo;</div>}
            <div className="field">
              <label htmlFor="rs-note">Outcome (saved with your name)</label>
              <input id="rs-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Recounted, desk count correct" />
            </div>
            <div className="xs muted">The counted amount stays as recorded. If the rider still owes cash, it stays on their balance.</div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setResolving(null)}>Cancel</button>
              <button type="button" className="btn navy" onClick={resolve}><Icon name="check" size={16} /> Mark resolved</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
