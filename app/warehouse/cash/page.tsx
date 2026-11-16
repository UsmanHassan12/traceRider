"use client";

import { useMemo, useRef, useState } from "react";
import { CashOnDate } from "@/components/CashOnDate";
import { CashReceive, type CashTarget } from "@/components/CashReceive";
import { ymd } from "@/lib/history";
import { DeskNav } from "@/components/DeskNav";
import { Icon } from "@/components/Icon";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Pager, usePaged } from "@/components/Pager";
import { QrScanner } from "@/components/QrScanner";
import { parseCashCode } from "@/lib/cashCode";
import { initials, isToday, pkr, time } from "@/lib/format";
import { cashInHand, useStore } from "@/lib/store";
import type { Deposit, Rider } from "@/lib/types";

type Banner = { tone: "good" | "bad"; title: string; sub?: string } | null;
type Show = "owing" | "all";

const when = (t: number) => (isToday(t) ? time(t) : `${new Date(t).toLocaleDateString("en-PK", { day: "numeric", month: "short" })} ${time(t)}`);

function statusPill(d: Deposit) {
  if (d.status === "pending") return <span className="pill warn">Waiting for rider</span>;
  if (d.status === "disputed") return <span className="pill bad">Rider disputes</span>;
  if (d.status === "resolved") return <span className="pill info">Resolved by admin</span>;
  return <span className="pill good">Confirmed</span>;
}

export default function WarehouseCash() {
  const { ready, state } = useStore();
  const [code, setCode] = useState("");
  const [banner, setBanner] = useState<Banner>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [receiving, setReceiving] = useState<CashTarget | null>(null);
  const [detail, setDetail] = useState<Rider | null>(null);
  const [show, setShow] = useState<Show>("owing");
  const [q, setQ] = useState("");
  const todayKey = ymd(Date.now());
  const [viewDay, setViewDay] = useState(todayKey);
  const input = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.riders
      .map((r) => {
        const bal = cashInHand(state, r.id);
        const deliveries = state.parcels.filter((p) => p.riderId === r.id && p.status === "delivered" && p.attempt && isToday(p.attempt.at) && p.cod > 0).length;
        const mine = state.deposits.filter((d) => d.riderId === r.id).sort((a, b) => b.at - a.at);
        return { r, ...bal, deliveries, last: mine[0], open: mine.filter((d) => d.status === "pending" || d.status === "disputed").length };
      })
      .filter((x) => show === "all" || x.inHand > 0 || x.open > 0)
      .filter((x) => !s || [x.r.name, x.r.id, x.r.phone].some((v) => v.toLowerCase().includes(s)))
      .sort((a, b) => b.inHand - a.inHand);
  }, [state, show, q]);
  const pg = usePaged(rows, 12, `${show}|${q}`);

  const todays = state.deposits.filter((d) => isToday(d.at)).sort((a, b) => b.at - a.at);
  const pgT = usePaged(todays, 10);

  if (!ready) return <LoadingScreen />;

  const riderName = (id: string) => state.riders.find((r) => r.id === id)?.name ?? id;
  const withRiders = state.riders.reduce((s, r) => s + cashInHand(state, r.id).inHand, 0);
  const receivedToday = todays.reduce((s, d) => s + d.amount, 0);
  const waiting = state.deposits.filter((d) => d.status === "pending").length;
  const disputed = state.deposits.filter((d) => d.status === "disputed").length;
  const owingCount = state.riders.filter((r) => cashInHand(state, r.id).inHand > 0).length;

  function handleCode(raw: string) {
    if (!raw.trim()) return;
    const c = parseCashCode(raw, state.riders);
    if (!c) {
      setBanner({ tone: "bad", title: "That is not a cash code", sub: "Scan the QR on the rider's Cash screen (Hand in cash). Parcel labels are scanned on Dispatch." });
      return;
    }
    if (!c.ok) return setBanner({ tone: "bad", title: c.message });
    if (c.requestId && state.deposits.some((d) => d.requestId === c.requestId)) {
      setBanner({ tone: "bad", title: "This cash code was already used", sub: "Ask the rider to close it and tap Hand in cash again." });
      return;
    }
    setBanner(null);
    setReceiving({ riderId: c.riderId, requestId: c.requestId, declared: c.declared });
  }

  const tile = { background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column" as const, gap: 4 };

  return (
    <div className="wh no-side">
      <DeskNav />

      <main className="wh-page">
        <div className="row between wrap" style={{ gap: 12, alignItems: "flex-end" }}>
          <div>
            <h1>Cash</h1>
            <div className="small muted">Scan the rider&apos;s cash QR, count the notes, enter the amount. The rider&apos;s phone updates once you mark it received.</div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <label htmlFor="cash-day" className="xs muted">Cash on</label>
            <input id="cash-day" type="date" className="input" value={viewDay} max={todayKey} onChange={(e) => setViewDay(e.target.value || todayKey)} style={{ width: "auto", minHeight: 42 }} />
            {viewDay !== todayKey && <button type="button" className="btn" onClick={() => setViewDay(todayKey)}>Back to today</button>}
          </div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); const raw = code; setCode(""); handleCode(raw); }}
          className="row"
          style={{ gap: 10, background: "#fff", border: "2px solid var(--green)", borderRadius: 14, padding: "4px 4px 4px 14px", boxShadow: "0 0 0 4px #e3f4ea" }}
        >
          <Icon name="qr" size={24} color="var(--green)" />
          <label htmlFor="cash-scan" className="sr-only">Scan the rider&apos;s cash QR</label>
          <input ref={input} id="cash-scan" autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan the rider's cash QR" style={{ flex: 1, minWidth: 0, fontSize: 16, border: 0, outline: "none", background: "transparent", minHeight: 46 }} />
          <button type="submit" className="btn green">Enter</button>
          <button type="button" className="btn" onClick={() => setCamOpen(true)} aria-label="Scan with camera">
            <Icon name="camera" size={18} /> <span className="hide-sm">Camera</span>
          </button>
        </form>

        {banner && (
          <div role="status" className="row" style={{ gap: 12, background: banner.tone === "good" ? "var(--green)" : "var(--red)", color: "#fff", borderRadius: 12, padding: "10px 14px" }}>
            <Icon name={banner.tone === "good" ? "check" : "alert"} size={22} stroke={2.8} />
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{banner.title}</div>
              {banner.sub && <div className="small" style={{ opacity: 0.85 }}>{banner.sub}</div>}
            </div>
            <button type="button" aria-label="Dismiss" className="icon-btn" style={{ width: 32, height: 32, background: "transparent", color: "#fff" }} onClick={() => setBanner(null)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        )}

        {viewDay !== todayKey ? <CashOnDate day={viewDay} /> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }} className="num">
          <div style={tile}><span className="xs muted">Cash with riders now</span><span style={{ fontSize: 24, fontWeight: 700 }}>{pkr(withRiders)}</span><span className="xs muted">{owingCount} rider{owingCount === 1 ? "" : "s"} to collect from</span></div>
          <div style={tile}><span className="xs muted">Received today</span><span style={{ fontSize: 24, fontWeight: 700, color: "var(--green)" }}>{pkr(receivedToday)}</span><span className="xs muted">{todays.length} handover{todays.length === 1 ? "" : "s"}</span></div>
          <div style={tile}><span className="xs muted">Waiting for rider&apos;s OK</span><span style={{ fontSize: 24, fontWeight: 700, color: waiting ? "var(--amber)" : undefined }}>{waiting}</span><span className="xs muted">Amount differed</span></div>
          <div style={tile}><span className="xs muted">Disputed</span><span style={{ fontSize: 24, fontWeight: 700, color: disputed ? "var(--red)" : undefined }}>{disputed}</span><span className="xs muted">Admin decides</span></div>
        </div>

        <section className="card pad-lg stack">
          <div className="row between wrap" style={{ gap: 8 }}>
            <h2>Riders</h2>
            <div className="row wrap" style={{ gap: 8 }}>
              <button type="button" className="chip" aria-pressed={show === "owing"} onClick={() => setShow("owing")}>To collect {owingCount}</button>
              <button type="button" className="chip" aria-pressed={show === "all"} onClick={() => setShow("all")}>All riders {state.riders.length}</button>
              <div className="row" style={{ gap: 6, border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 10px", minHeight: 38, width: "min(220px, 100%)" }}>
                <Icon name="search" size={16} color="var(--muted)" />
                <input aria-label="Find a rider" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a rider" style={{ border: 0, outline: 0, flex: 1, minWidth: 0, background: "transparent", font: "inherit" }} />
              </div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 820 }}>
              <thead>
                <tr><th>Rider</th><th>COD deliveries today</th><th>Collected today</th><th>From earlier days</th><th>Handed in today</th><th>To collect</th><th>Last handover</th><th /></tr>
              </thead>
              <tbody>
                {pg.rows.length === 0 && (
                  <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>{show === "owing" ? "No rider is holding cash. Everything is collected." : "No riders found."}</td></tr>
                )}
                {pg.rows.map((x) => (
                  <tr key={x.r.id} style={{ cursor: "pointer" }} onClick={() => setDetail(x.r)}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <span className="avatar">{initials(x.r.name)}</span>
                        <span><b>{x.r.name}</b><div className="xs muted">{x.r.id}{x.r.phone ? ` · 0${x.r.phone}` : ""}</div></span>
                      </div>
                    </td>
                    <td className="num">{x.deliveries}</td>
                    <td className="num">{pkr(x.collected)}</td>
                    <td className="num" style={{ color: x.carried > 0 ? "var(--red)" : undefined }}>{x.carried > 0 ? pkr(x.carried) : "—"}</td>
                    <td className="num">{x.deposited > 0 ? pkr(x.deposited) : "—"}</td>
                    <td className="num"><b style={{ fontSize: 15, color: x.inHand > 0 ? "var(--ink)" : "var(--muted)" }}>{pkr(x.inHand)}</b></td>
                    <td className="small">{x.last ? <>{when(x.last.at)}<div style={{ marginTop: 2 }}>{statusPill(x.last)}</div></> : <span className="muted">Never</span>}</td>
                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn sm green" onClick={() => setReceiving({ riderId: x.r.id })}>
                        <Icon name="cash" size={14} /> Receive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...pg} label="riders" />
          <div className="xs muted">Tip: ask the rider to show the QR from Cash › Hand in cash. Without it, the rider has to confirm your amount on his phone afterwards.</div>
        </section>

        <section className="card pad-lg stack">
          <h2>Today&apos;s handovers</h2>
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 640 }}>
              <thead>
                <tr><th>Time</th><th>Rider</th><th>Rider declared</th><th>Counted</th><th>Counted by</th><th>Status</th></tr>
              </thead>
              <tbody>
                {pgT.rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>No cash received today yet.</td></tr>}
                {pgT.rows.map((d, i) => {
                  const diff = d.declared !== undefined ? d.amount - d.declared : 0;
                  return (
                    <tr key={d.id ?? `${d.at}-${i}`}>
                      <td className="small">{time(d.at)}</td>
                      <td><b>{riderName(d.riderId)}</b>{d.riderNote && <div className="xs" style={{ color: "var(--red)" }}>&ldquo;{d.riderNote}&rdquo;</div>}</td>
                      <td className="num">{d.declared !== undefined ? pkr(d.declared) : <span className="xs muted">No QR</span>}</td>
                      <td className="num"><b>{pkr(d.amount)}</b>{diff !== 0 && <div className="xs" style={{ color: diff < 0 ? "var(--red)" : "var(--amber-ink)" }}>{diff < 0 ? `${pkr(-diff)} short` : `${pkr(diff)} over`}</div>}</td>
                      <td className="small">{d.by}</td>
                      <td>{statusPill(d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager {...pgT} label="handovers" />
        </section>
        </>}
      </main>

      {camOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setCamOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cam-title" style={{ width: "min(460px, 100%)" }}>
            <div className="row between">
              <h2 id="cam-title">Scan the rider&apos;s cash QR</h2>
              <button type="button" className="icon-btn" aria-label="Close camera" onClick={() => setCamOpen(false)}><Icon name="x" size={18} /></button>
            </div>
            <div style={{ height: 340, borderRadius: 12, overflow: "hidden" }}>
              <QrScanner onResult={(t) => { setCamOpen(false); handleCode(t); }} />
            </div>
          </div>
        </div>
      )}

      {detail && !receiving && <RiderCash rider={detail} onClose={() => setDetail(null)} onReceive={() => setReceiving({ riderId: detail.id })} />}

      {receiving && (
        <CashReceive
          target={receiving}
          onClose={() => { setReceiving(null); input.current?.focus(); }}
          onDone={(msg) => {
            setBanner({ tone: "good", title: msg });
            setReceiving(null);
            input.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** One rider: what he collected (today and still owed from before) and every handover. */
function RiderCash({ rider, onClose, onReceive }: { rider: Rider; onClose: () => void; onReceive: () => void }) {
  const { state } = useStore();
  const bal = cashInHand(state, rider.id);
  const collected = state.parcels
    .filter((p) => p.riderId === rider.id && p.status === "delivered" && p.attempt && p.cod > 0)
    .sort((a, b) => b.attempt!.at - a.attempt!.at);
  const deposits = state.deposits.filter((d) => d.riderId === rider.id).sort((a, b) => b.at - a.at);
  const pgC = usePaged(collected, 8);
  const pgD = usePaged(deposits, 6);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rc-title" style={{ width: "min(640px, 100%)", maxHeight: "90dvh", overflowY: "auto" }}>
        <div className="row between" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="avatar" style={{ width: 42, height: 42 }}>{initials(rider.name)}</span>
            <div>
              <h2 id="rc-title">{rider.name}</h2>
              <div className="xs muted">{rider.id}{rider.phone ? ` · 0${rider.phone}` : ""}</div>
            </div>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }} className="num">
          <div className="tile"><div className="xs muted">Collected today</div><b>{pkr(bal.collected)}</b></div>
          <div className="tile"><div className="xs muted">From earlier days</div><b style={{ color: bal.carried > 0 ? "var(--red)" : undefined }}>{pkr(bal.carried)}</b></div>
          <div className="tile"><div className="xs muted">To collect now</div><b style={{ fontSize: 18 }}>{pkr(bal.inHand)}</b></div>
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <div className="xs muted" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>COD collected (last 10 days)</div>
          {collected.length === 0 && <div className="small muted">No COD deliveries.</div>}
          {pgC.rows.map((p) => (
            <div key={p.id} className="row between small" style={{ borderTop: "1px solid #eef1f5", paddingTop: 6 }}>
              <span style={{ minWidth: 0 }}>
                <b>{p.id}</b> · {p.customer}
                <div className="xs muted">{when(p.attempt!.at)} · {p.area}{p.attempt?.byAdmin ? ` · marked by ${p.attempt.byAdmin}` : ""}</div>
              </span>
              <b className="num">{pkr(p.cod)}</b>
            </div>
          ))}
          <Pager {...pgC} compact label="deliveries" />
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <div className="xs muted" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Handovers at the warehouse</div>
          {deposits.length === 0 && <div className="small muted">No cash handed in yet.</div>}
          {pgD.rows.map((d, i) => (
            <div key={d.id ?? `${d.at}-${i}`} className="row between small" style={{ borderTop: "1px solid #eef1f5", paddingTop: 6, gap: 8 }}>
              <span>
                {when(d.at)} · counted by {d.by}
                {d.declared !== undefined && d.declared !== d.amount && <div className="xs" style={{ color: "var(--red)" }}>Rider declared {pkr(d.declared)}</div>}
                {d.riderNote && <div className="xs" style={{ color: "var(--red)" }}>&ldquo;{d.riderNote}&rdquo;</div>}
              </span>
              <span className="row" style={{ gap: 8 }}>
                {statusPill(d)}
                <b className="num">{pkr(d.amount)}</b>
              </span>
            </div>
          ))}
          <Pager {...pgD} compact label="handovers" />
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn green" onClick={onReceive}><Icon name="cash" size={16} /> Receive cash · {pkr(bal.inHand)}</button>
        </div>
      </div>
    </div>
  );
}
