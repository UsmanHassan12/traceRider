"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeskNav } from "@/components/DeskNav";
import { Icon } from "@/components/Icon";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Pager, usePaged } from "@/components/Pager";
import { PhotoThumb } from "@/components/PhotoCapture";
import { QrScanner } from "@/components/QrScanner";
import { fmtDistance, isToday, pkr, time } from "@/lib/format";
import { closedBetween, dayEnd, dayStart, downloadCsv, ymd } from "@/lib/history";
import { useStore } from "@/lib/store";
import type { Parcel } from "@/lib/types";

type Banner = { tone: "good" | "bad"; title: string; sub?: string } | null;

const when = (t: number) => (isToday(t) ? `Today ${time(t)}` : `${new Date(t).toLocaleDateString("en-PK", { day: "numeric", month: "short" })} ${time(t)}`);
const sentAgain = (p: Parcel) => p.events.find((e) => e.what.startsWith("Sent out again as "))?.what.replace("Sent out again as ", "");

function nowPill(p: Parcel) {
  if (p.status === "returned") return <span className="pill warn">Coming back</span>;
  if (sentAgain(p)) return <span className="pill info">Sent again</span>;
  if (p.status === "received") return <span className="pill good">Checked in</span>;
  return <span className="pill">{p.status}</span>;
}

export default function WarehouseReturns() {
  const { ready, state, receiveReturn } = useStore();
  const [code, setCode] = useState("");
  const [banner, setBanner] = useState<Banner>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [open, setOpen] = useState<Parcel | null>(null);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // track record: returns between two dates, read from the database
  const [from, setFrom] = useState(ymd(Date.now() - 6 * 864e5));
  const [to, setTo] = useState(ymd(Date.now()));
  const [rider, setRider] = useState("");
  const [hist, setHist] = useState<Parcel[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);

  const riderName = (id?: string) => state.riders.find((r) => r.id === id)?.name ?? "—";

  const coming = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.parcels
      .filter((p) => p.status === "returned")
      .filter((p) => !s || [p.id, p.trk, p.customer, p.area, p.attempt?.reason ?? "", riderName(p.riderId)].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => (a.attempt?.at ?? 0) - (b.attempt?.at ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.parcels, state.riders, q]);
  const pgC = usePaged(coming, 10, q);

  const loadHist = useCallback(async () => {
    if (!from || !to) return;
    setHistLoading(true);
    setHistError(null);
    try {
      const rows = await closedBetween(dayStart(from), dayEnd(to), "returned");
      setHist(rows.sort((a, b) => (b.attempt?.at ?? 0) - (a.attempt?.at ?? 0)));
    } catch (e) {
      setHistError((e as Error).message);
      setHist([]);
    } finally {
      setHistLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    if (ready) void loadHist();
  }, [ready, loadHist]);

  // keep the history in step with check-ins made on this screen
  const histLive = useMemo(() => hist.map((h) => state.parcels.find((p) => p.id === h.id) ?? h), [hist, state.parcels]);
  const histShown = histLive.filter((p) => !rider || p.riderId === rider);
  const pgH = usePaged(histShown, 15, `${from}|${to}|${rider}`);

  const byRider = useMemo(() => {
    const m = new Map<string, { n: number; flagged: number; back: number }>();
    for (const p of histLive) {
      const k = p.riderId ?? "";
      const c = m.get(k) ?? { n: 0, flagged: 0, back: 0 };
      c.n++;
      if (p.flags.length) c.flagged++;
      if (p.status === "returned") c.back++;
      m.set(k, c);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n);
  }, [histLive]);
  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of histShown) m.set(p.attempt?.reason ?? "No reason given", (m.get(p.attempt?.reason ?? "No reason given") ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [histShown]);

  if (!ready) return <LoadingScreen />;

  const checkedToday = state.parcels.filter((p) => p.status === "received" && p.events.some((e) => e.what.startsWith("Return checked in") && isToday(e.at))).length;

  function checkIn(p: Parcel) {
    const r = receiveReturn(p.trk);
    setBanner({
      tone: r.ok ? "good" : "bad",
      title: r.ok ? `${p.trk} checked in · returned by ${riderName(p.riderId)}` : r.message,
      sub: r.ok ? `Reason: ${p.attempt?.reason ?? "not given"}${p.flags.length ? ` · Flagged: ${p.flags.join(" · ")}. Check the box condition.` : ""}` : undefined,
    });
    setOpen(null);
    input.current?.focus();
  }

  function handleCode(raw: string) {
    const norm = raw.trim().toUpperCase().replace(/^#/, "");
    if (!norm) return;
    const p = state.parcels.find((x) => x.trk.toUpperCase() === norm || x.id.replace("#", "").toUpperCase() === norm);
    if (!p) return setBanner({ tone: "bad", title: `No parcel found for ${raw}` });
    if (p.status === "returned") return checkIn(p);
    if (p.status === "received") return setBanner({ tone: "bad", title: `${p.trk} was already checked in`, sub: `Returned by ${riderName(p.riderId)} · ${p.attempt?.reason ?? ""}` });
    setBanner({ tone: "bad", title: `${p.trk} is not a return`, sub: `Status: ${p.status}${p.riderId ? ` · ${riderName(p.riderId)}` : ""}` });
  }

  function exportCsv() {
    downloadCsv(
      [
        ["Returned on", "Order", "Tracking", "Customer", "Phone", "Area", "Rider", "Reason", "Calls", "Distance m", "Photo", "Flags", "Now", "COD"],
        ...histShown.map((p) => [
          p.attempt ? new Date(p.attempt.at).toLocaleString("en-PK") : "",
          p.id, p.trk, p.customer, p.phone, p.area, riderName(p.riderId), p.attempt?.reason ?? "",
          p.attempt?.calls ?? 0, p.attempt?.distanceM ?? "", p.attempt?.photo ? "yes" : "no", p.flags.join("; "),
          p.status === "returned" ? "Coming back" : sentAgain(p) ? "Sent again" : "Checked in", p.cod,
        ]),
      ],
      `returns-${from}-to-${to}.csv`
    );
  }

  const tile = { background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column" as const, gap: 4 };

  return (
    <div className="wh no-side">
      <DeskNav />

      <main className="wh-page">
        <div>
          <h1>Returns</h1>
          <div className="small muted">Scan each box a rider brings back to check it in. Every return keeps its reason, the rider&apos;s proof and where it is now.</div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); const raw = code; setCode(""); handleCode(raw); }}
          className="row"
          style={{ gap: 10, background: "#fff", border: "2px solid var(--red)", borderRadius: 14, padding: "4px 4px 4px 14px", boxShadow: "0 0 0 4px var(--red-soft)" }}
        >
          <Icon name="scan" size={24} color="var(--red)" />
          <label htmlFor="ret-scan" className="sr-only">Scan a returned box</label>
          <input ref={input} id="ret-scan" autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan the returned box's QR" style={{ flex: 1, minWidth: 0, fontSize: 16, border: 0, outline: "none", background: "transparent", minHeight: 46 }} />
          <button type="submit" className="btn red">Check in</button>
          <button type="button" className="btn" onClick={() => setCamOpen(true)} aria-label="Scan with camera">
            <Icon name="camera" size={18} /> <span className="hide-sm">Camera</span>
          </button>
        </form>

        {banner && (
          <div role="status" className="row" style={{ gap: 12, background: banner.tone === "good" ? "var(--green)" : "var(--red)", color: "#fff", borderRadius: 12, padding: "10px 14px" }}>
            <Icon name={banner.tone === "good" ? "check" : "alert"} size={22} stroke={2.8} />
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{banner.title}</div>
              {banner.sub && <div className="small" style={{ opacity: 0.9 }}>{banner.sub}</div>}
            </div>
            <button type="button" aria-label="Dismiss" className="icon-btn" style={{ width: 32, height: 32, background: "transparent", color: "#fff" }} onClick={() => setBanner(null)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }} className="num">
          <div style={tile}><span className="xs muted">Coming back now</span><span style={{ fontSize: 24, fontWeight: 700, color: coming.length ? "var(--red)" : undefined }}>{state.parcels.filter((p) => p.status === "returned").length}</span><span className="xs muted">Not at the warehouse yet</span></div>
          <div style={tile}><span className="xs muted">Checked in today</span><span style={{ fontSize: 24, fontWeight: 700, color: "var(--green)" }}>{checkedToday}</span></div>
          <div style={tile}><span className="xs muted">Returns {from === to ? "that day" : "in range"}</span><span style={{ fontSize: 24, fontWeight: 700 }}>{histLive.length}</span><span className="xs muted">{histLive.filter((p) => p.flags.length).length} flagged</span></div>
        </div>

        <section className="card pad-lg stack">
          <div className="row between wrap" style={{ gap: 8 }}>
            <h2>Coming back <span className="muted">({coming.length})</span></h2>
            <div className="row" style={{ gap: 6, border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 10px", minHeight: 38, width: "min(240px, 100%)" }}>
              <Icon name="search" size={16} color="var(--muted)" />
              <input aria-label="Search returns coming back" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order, rider, reason" style={{ border: 0, outline: 0, flex: 1, minWidth: 0, background: "transparent", font: "inherit" }} />
            </div>
          </div>
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 820 }}>
              <thead><tr><th>Order</th><th>Customer</th><th>Rider</th><th>Reason</th><th>Returned</th><th>Proof</th><th /></tr></thead>
              <tbody>
                {pgC.rows.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 22 }}>No returns on the way.</td></tr>}
                {pgC.rows.map((p) => (
                  <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setOpen(p)}>
                    <td><b>{p.id}</b><div className="xs muted mono">{p.trk}</div></td>
                    <td>{p.customer}<div className="xs muted">{p.area}</div></td>
                    <td className="small">{riderName(p.riderId)}</td>
                    <td className="small" style={{ maxWidth: 200 }}>{p.attempt?.reason ?? "—"}{p.flags.length > 0 && <div><span className="flag">Flagged</span></div>}</td>
                    <td className="small">{p.attempt ? when(p.attempt.at) : "—"}</td>
                    <td className="small">{p.attempt ? `${p.attempt.calls} call${p.attempt.calls === 1 ? "" : "s"} · ${p.attempt.photo ? "photo" : "no photo"}` : "—"}</td>
                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn sm red" onClick={() => checkIn(p)}><Icon name="check" size={14} /> Check in</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...pgC} label="returns" />
        </section>

        <section className="card pad-lg stack">
          <div className="row between wrap" style={{ gap: 8, alignItems: "flex-end" }}>
            <div>
              <h2>Track record</h2>
              <div className="xs muted">Every return between two dates, with the reason and where the box is now.</div>
            </div>
            <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
              <div className="field" style={{ gap: 2 }}>
                <label htmlFor="rf" className="xs muted">From</label>
                <input id="rf" type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ minHeight: 38, width: "auto" }} />
              </div>
              <div className="field" style={{ gap: 2 }}>
                <label htmlFor="rt" className="xs muted">To</label>
                <input id="rt" type="date" className="input" value={to} min={from} max={ymd(Date.now())} onChange={(e) => setTo(e.target.value)} style={{ minHeight: 38, width: "auto" }} />
              </div>
              <select aria-label="Rider" className="input" value={rider} onChange={(e) => setRider(e.target.value)} style={{ minHeight: 38, width: "auto" }}>
                <option value="">All riders</option>
                {state.riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button type="button" className="btn sm" onClick={exportCsv} disabled={histShown.length === 0}><Icon name="printer" size={14} /> Export CSV</button>
            </div>
          </div>

          {histError && <div className="small" style={{ color: "var(--red)" }}>Could not load returns: {histError}</div>}

          {byRider.length > 0 && (
            <div className="row wrap" style={{ gap: 8 }}>
              {byRider.map(([id, v]) => (
                <button key={id || "none"} type="button" className="chip" aria-pressed={rider === id} onClick={() => setRider(rider === id ? "" : id)}>
                  {id ? riderName(id) : "No rider"} · {v.n}{v.flagged ? ` (${v.flagged} flagged)` : ""}
                </button>
              ))}
            </div>
          )}
          {reasons.length > 0 && (
            <div className="xs muted">
              Reasons: {reasons.map(([r, n]) => `${r} ${n}`).join(" · ")}
            </div>
          )}

          <div className="table-wrap">
            <table className="data" style={{ minWidth: 820 }}>
              <thead><tr><th>Returned</th><th>Order</th><th>Customer</th><th>Rider</th><th>Reason</th><th>Proof</th><th>Now</th></tr></thead>
              <tbody>
                {histLoading && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 22 }}>Loading…</td></tr>}
                {!histLoading && pgH.rows.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 22 }}>No returns in these dates.</td></tr>}
                {!histLoading && pgH.rows.map((p) => (
                  <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setOpen(p)}>
                    <td className="small">{p.attempt ? when(p.attempt.at) : "—"}</td>
                    <td><b>{p.id}</b><div className="xs muted mono">{p.trk}</div></td>
                    <td>{p.customer}<div className="xs muted">{p.area}</div></td>
                    <td className="small">{riderName(p.riderId)}</td>
                    <td className="small" style={{ maxWidth: 200 }}>{p.attempt?.reason ?? "—"}{p.flags.length > 0 && <div className="xs" style={{ color: "var(--red)" }}>{p.flags.join(" · ")}</div>}</td>
                    <td className="small">{p.attempt ? `${p.attempt.calls} call${p.attempt.calls === 1 ? "" : "s"} · ${p.attempt.photo ? "photo" : "no photo"}` : "—"}</td>
                    <td>{nowPill(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...pgH} label="returns" />
        </section>
      </main>

      {camOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setCamOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cam-title" style={{ width: "min(460px, 100%)" }}>
            <div className="row between">
              <h2 id="cam-title">Scan a returned box</h2>
              <button type="button" className="icon-btn" aria-label="Close camera" onClick={() => setCamOpen(false)}><Icon name="x" size={18} /></button>
            </div>
            <div style={{ height: 340, borderRadius: 12, overflow: "hidden" }}>
              <QrScanner onResult={(t) => { setCamOpen(false); handleCode(t); }} />
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ret-title" style={{ width: "min(560px, 100%)", maxHeight: "90dvh", overflowY: "auto" }}>
            <div className="row between" style={{ gap: 8 }}>
              <h2 id="ret-title">{open.id} · {open.customer}</h2>
              {nowPill(open)}
            </div>
            <div className="small muted">{open.address}{open.phone ? ` · 0${open.phone}` : ""}</div>
            <div className="grid2">
              <div className="tile"><div className="xs muted">Rider</div><b>{riderName(open.riderId)}</b></div>
              <div className="tile"><div className="xs muted">Returned</div><b>{open.attempt ? when(open.attempt.at) : "—"}</b></div>
              <div className="tile"><div className="xs muted">Reason</div><b>{open.attempt?.reason ?? "—"}</b></div>
              <div className="tile"><div className="xs muted">Calls · distance</div><b className="num">{open.attempt ? `${open.attempt.calls} · ${open.attempt.distanceM >= 0 ? fmtDistance(open.attempt.distanceM) : "no map pin"}` : "—"}</b></div>
            </div>
            {open.attempt?.photo && (
              <div className="row" style={{ gap: 10 }}>
                <PhotoThumb src={open.attempt.photo} size={72} />
                <span className="xs muted">Doorstep photo from the rider</span>
              </div>
            )}
            {open.attempt?.where && (
              <a className="small" href={`https://www.google.com/maps?q=${open.attempt.where.lat},${open.attempt.where.lng}`} target="_blank" rel="noreferrer">
                <Icon name="pin" size={14} /> Where the rider was when he marked it returned
              </a>
            )}
            {open.flags.length > 0 && (
              <div className="card" style={{ padding: 10, background: "#fff4f4", borderColor: "#f3c7c7" }}>
                <div className="xs" style={{ color: "var(--red)", fontWeight: 600 }}>Flagged</div>
                {open.flags.map((f) => <div key={f} className="small">{f}</div>)}
              </div>
            )}
            {open.events.length > 0 && (
              <div className="stack scroll-box" style={{ gap: 6, maxHeight: 200 }}>
                <div className="xs muted">Custody log</div>
                {[...open.events].reverse().map((e, i) => (
                  <div key={i} className="row small" style={{ gap: 8, alignItems: "flex-start" }}>
                    <span className="xs muted num" style={{ flex: "none", width: 104 }}>{when(e.at)}</span>
                    <span style={{ color: e.kind === "bad" ? "var(--red)" : undefined }}>{e.what} <span className="xs muted">· {e.by}</span></span>
                  </div>
                ))}
              </div>
            )}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <span className="grow small num">{open.cod ? `COD ${pkr(open.cod)} not collected` : "Prepaid"}</span>
              <button type="button" className="btn" onClick={() => setOpen(null)}>Close</button>
              {open.status === "returned" && <button type="button" className="btn red" onClick={() => checkIn(open)}><Icon name="check" size={16} /> Check in</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
