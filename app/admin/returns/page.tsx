"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Pager, usePaged } from "@/components/Pager";
import { PhotoThumb } from "@/components/PhotoCapture";
import { useToast } from "@/components/Toast";
import { fmtDistance, isToday, pkr, time } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Parcel } from "@/lib/types";

type Filter = "all" | "coming" | "in" | "again" | "flagged";
type Range = "today" | "7d" | "all";

const sentAgainAs = (p: Parcel) => p.events.find((e) => e.what.startsWith("Sent out again as "))?.what.replace("Sent out again as ", "");
const returnedAt = (p: Parcel) => p.attempt?.at ?? p.events[p.events.length - 1]?.at ?? p.createdAt;
const dayLabel = (t: number) => (isToday(t) ? "Today" : new Date(t).toLocaleDateString("en-PK", { day: "numeric", month: "short" }));

export default function ReturnsPage() {
  const { state, receiveReturn, sendAgain } = useStore();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("coming");
  const [range, setRange] = useState<Range>("7d");
  const [rider, setRider] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Parcel | null>(null);

  const riderName = (id?: string) => state.riders.find((r) => r.id === id)?.name ?? "—";

  // every return in range, before the status chips and search
  const inRange = useMemo(() => {
    const since = range === "today" ? new Date().setHours(0, 0, 0, 0) : range === "7d" ? Date.now() - 7 * 864e5 : 0;
    return state.parcels
      .filter((p) => p.status === "returned" || p.status === "received")
      .filter((p) => returnedAt(p) >= since)
      .filter((p) => !rider || p.riderId === rider);
  }, [state.parcels, range, rider]);

  const groups: Record<Filter, (p: Parcel) => boolean> = {
    all: () => true,
    coming: (p) => p.status === "returned",
    in: (p) => p.status === "received" && !sentAgainAs(p),
    again: (p) => !!sentAgainAs(p),
    flagged: (p) => p.flags.length > 0,
  };
  const count = (f: Filter) => inRange.filter(groups[f]).length;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return inRange
      .filter(groups[filter])
      .filter((p) => !s || [p.id, p.trk, p.customer, p.phone, p.area, p.attempt?.reason ?? "", riderName(p.riderId)].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => returnedAt(b) - returnedAt(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRange, filter, q, state.riders]);
  const pg = usePaged(list, 20, `${filter}|${range}|${rider}|${q}`);

  // why parcels come back, and who brings them back
  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of inRange) m.set(p.attempt?.reason ?? "No reason given", (m.get(p.attempt?.reason ?? "No reason given") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inRange]);
  const byRider = useMemo(() => {
    const m = new Map<string, { n: number; flagged: number }>();
    for (const p of inRange) {
      const k = p.riderId ?? "";
      const cur = m.get(k) ?? { n: 0, flagged: 0 };
      cur.n += 1;
      if (p.flags.length) cur.flagged += 1;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [inRange]);
  const codBack = inRange.reduce((s, p) => s + p.cod, 0);

  function checkIn(p: Parcel) {
    const r = receiveReturn(p.trk);
    toast(r.message, r.ok ? "good" : "bad");
    setOpen(null);
  }
  function again(p: Parcel) {
    const r = sendAgain(p.id);
    toast(r.message, r.ok ? "good" : "bad");
    setOpen(null);
  }

  const statusPill = (p: Parcel) => {
    const copy = sentAgainAs(p);
    if (copy) return <span className="pill info">Sent again · {copy}</span>;
    return p.status === "returned" ? <span className="pill warn">Coming back</span> : <span className="pill good">Checked in</span>;
  };

  const tile = { background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column" as const, gap: 6 };
  const chips: [Filter, string][] = [
    ["coming", "Coming back"],
    ["in", "Checked in"],
    ["again", "Sent again"],
    ["flagged", "Flagged"],
    ["all", "All returns"],
  ];

  return (
    <main className="adm-main">
      <div className="row between wrap" style={{ gap: 12, alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Returns</h1>
          <div className="small muted">Every parcel that came back: where it is now, why, who brought it back and the proof. Last 10 days, plus anything still on its way back.</div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 4 }}>
            {([
              ["today", "Today"],
              ["7d", "7 days"],
              ["all", "All"],
            ] as [Range, string][]).map(([r, l]) => (
              <button key={r} type="button" className="chip" aria-pressed={range === r} onClick={() => setRange(r)}>{l}</button>
            ))}
          </div>
          <select aria-label="Rider" className="input" value={rider} onChange={(e) => setRider(e.target.value)} style={{ width: "auto", minHeight: 40 }}>
            <option value="">All riders</option>
            {state.riders.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }} className="num">
        <div style={tile}><span className="xs muted">Returns</span><span style={{ fontSize: 26, fontWeight: 700 }}>{inRange.length}</span></div>
        <div style={tile}><span className="xs muted">Still coming back</span><span style={{ fontSize: 26, fontWeight: 700, color: count("coming") ? "var(--amber)" : undefined }}>{count("coming")}</span></div>
        <div style={tile}><span className="xs muted">Checked in at warehouse</span><span style={{ fontSize: 26, fontWeight: 700, color: "var(--green)" }}>{inRange.filter((p) => p.status === "received").length}</span></div>
        <div style={{ ...tile, ...(count("flagged") ? { background: "var(--red)", color: "#fff", border: 0 } : {}) }}>
          <span className="xs" style={{ color: count("flagged") ? "#f7d9d9" : "var(--muted)" }}>Flagged (rules not followed)</span>
          <span style={{ fontSize: 26, fontWeight: 700 }}>{count("flagged")}</span>
        </div>
        <div style={tile}><span className="xs muted">COD not collected</span><span style={{ fontSize: 26, fontWeight: 700 }}>{pkr(codBack)}</span></div>
      </div>

      <div className="row wrap" style={{ gap: 16, alignItems: "flex-start" }}>
        <section className="card pad-lg stack" style={{ flex: "3 1 560px", minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 6, overflowX: "auto" }}>
              {chips.map(([f, l]) => (
                <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {l} {count(f)}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 8, background: "#fff", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 12px", minHeight: 40, width: "min(260px, 100%)" }}>
              <Icon name="search" size={16} color="var(--muted)" />
              <input aria-label="Search returns" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order, customer, reason" style={{ border: 0, outline: 0, flex: 1, minWidth: 0, font: "inherit", background: "transparent" }} />
            </div>
          </div>

          <div className="table-wrap">
            <table className="data" style={{ minWidth: 820 }}>
              <thead>
                <tr><th>Order</th><th>Customer</th><th>Rider</th><th>Reason</th><th>Returned</th><th>Proof</th><th>Now</th><th /></tr>
              </thead>
              <tbody>
                {pg.rows.length === 0 && (
                  <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>{filter === "coming" ? "No parcels on their way back." : "No returns here."}</td></tr>
                )}
                {pg.rows.map((p) => (
                  <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setOpen(p)}>
                    <td><b>{p.id}</b><div className="xs muted mono">{p.trk}</div></td>
                    <td>{p.customer}<div className="xs muted">{p.area}</div></td>
                    <td className="small">{riderName(p.riderId)}</td>
                    <td className="small" style={{ maxWidth: 200 }}>
                      {p.attempt?.reason ?? <span className="muted">—</span>}
                      {p.attempt?.byAdmin && <div className="xs muted">Marked by {p.attempt.byAdmin}</div>}
                    </td>
                    <td className="small">{dayLabel(returnedAt(p))}<div className="xs muted">{time(returnedAt(p))}</div></td>
                    <td className="small">
                      {p.attempt ? (
                        <>
                          {p.attempt.calls} call{p.attempt.calls === 1 ? "" : "s"} · {p.attempt.photo ? "photo" : "no photo"}
                          {p.flags.length > 0 && <div className="xs" style={{ color: "var(--red)", fontWeight: 600 }}>{p.flags.length} flag{p.flags.length === 1 ? "" : "s"}</div>}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{statusPill(p)}</td>
                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      {p.status === "returned" && <button type="button" className="btn sm" onClick={() => checkIn(p)}><Icon name="check" size={14} /> Check in</button>}
                      {p.status === "received" && !sentAgainAs(p) && <button type="button" className="btn sm" onClick={() => again(p)}><Icon name="refresh" size={14} /> Send again</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...pg} label="returns" />
        </section>

        <div className="stack" style={{ flex: "1 1 280px", minWidth: 0, gap: 16 }}>
          <section className="card pad-lg stack">
            <h2>Why they came back</h2>
            {reasons.length === 0 && <div className="small muted">No returns in this period.</div>}
            {reasons.map(([r, n]) => (
              <div key={r} className="stack" style={{ gap: 4 }}>
                <div className="row between small"><span>{r}</span><b className="num">{n}</b></div>
                <div style={{ height: 6, borderRadius: 99, background: "var(--ground)" }}>
                  <div style={{ width: `${(n / inRange.length) * 100}%`, height: "100%", borderRadius: 99, background: "var(--navy)" }} />
                </div>
              </div>
            ))}
          </section>
          <section className="card pad-lg stack">
            <h2>Returns by rider</h2>
            {byRider.length === 0 && <div className="small muted">No returns in this period.</div>}
            {byRider.map(([id, v]) => (
              <button key={id || "none"} type="button" className="row between small" onClick={() => setRider(rider === id ? "" : id)} style={{ background: "none", border: 0, padding: "6px 0", borderTop: "1px solid #eef1f5", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontWeight: rider === id ? 700 : 500 }}>{id ? riderName(id) : "No rider"}</span>
                <span className="num">
                  <b>{v.n}</b>
                  {v.flagged > 0 && <span style={{ color: "var(--red)" }}> · {v.flagged} flagged</span>}
                </span>
              </button>
            ))}
          </section>
        </div>
      </div>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rt-title" style={{ maxWidth: 560 }}>
            <div className="row between" style={{ gap: 8 }}>
              <h2 id="rt-title">{open.id} · {open.customer}</h2>
              {statusPill(open)}
            </div>
            <div className="small muted">{open.address}{open.phone ? ` · ${open.phone}` : ""}</div>
            <div className="grid2">
              <div className="tile"><div className="xs muted">Rider</div><b>{riderName(open.riderId)}</b></div>
              <div className="tile"><div className="xs muted">COD</div><b className="num">{open.cod ? pkr(open.cod) : "Prepaid"}</b></div>
              <div className="tile"><div className="xs muted">Reason</div><b>{open.attempt?.reason ?? "—"}</b></div>
              <div className="tile">
                <div className="xs muted">Calls · distance</div>
                <b className="num">{open.attempt ? `${open.attempt.calls} · ${open.attempt.distanceM >= 0 ? fmtDistance(open.attempt.distanceM) : "no map pin"}` : "—"}</b>
              </div>
            </div>
            {open.attempt?.photo && (
              <div className="row" style={{ gap: 10 }}>
                <PhotoThumb src={open.attempt.photo} size={72} />
                <span className="xs muted">Doorstep photo from the rider</span>
              </div>
            )}
            {open.attempt?.where && (
              <a className="small" href={`https://www.google.com/maps?q=${open.attempt.where.lat},${open.attempt.where.lng}`} target="_blank" rel="noreferrer">
                <Icon name="pin" size={14} /> Where the rider was when marking it returned
              </a>
            )}
            {open.flags.length > 0 && (
              <div className="card" style={{ padding: 10, background: "#fff4f4", borderColor: "#f3c7c7" }}>
                <div className="xs" style={{ color: "var(--red)", fontWeight: 600, marginBottom: 4 }}>Flags</div>
                {open.flags.map((f) => <div key={f} className="small">{f}</div>)}
                {open.review ? (
                  <div className="xs muted" style={{ marginTop: 6 }}>Reviewed: {open.review.decision === "rider" ? "rider at fault" : open.review.decision === "customer" ? "customer at fault" : "needs checking"}{open.review.note ? ` · ${open.review.note}` : ""}</div>
                ) : open.attempt && isToday(open.attempt.at) ? (
                  <Link href={`/admin/review?id=${encodeURIComponent(open.id)}`} className="xs" style={{ display: "inline-block", marginTop: 6 }}>Review this return</Link>
                ) : null}
              </div>
            )}
            <div className="stack scroll-box" style={{ gap: 6, maxHeight: 200 }}>
              <div className="xs muted">Custody log</div>
              {[...open.events].reverse().map((e, i) => (
                <div key={i} className="row small" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span className="xs muted num" style={{ flex: "none", width: 92 }}>{dayLabel(e.at)} {time(e.at)}</span>
                  <span style={{ color: e.kind === "bad" ? "var(--red)" : undefined }}>{e.what} <span className="xs muted">· {e.by}</span></span>
                </div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn" onClick={() => setOpen(null)}>Close</button>
              {open.status === "returned" && <button type="button" className="btn navy" onClick={() => checkIn(open)}><Icon name="check" size={16} /> Check in at warehouse</button>}
              {open.status === "received" && !sentAgainAs(open) && <button type="button" className="btn navy" onClick={() => again(open)}><Icon name="refresh" size={16} /> Send again</button>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
