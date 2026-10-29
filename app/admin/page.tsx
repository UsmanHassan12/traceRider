"use client";

import Link from "next/link";
import { initials, isToday, pkr, time } from "@/lib/format";
import { cashInHand, useStore } from "@/lib/store";
import type { ReturnReason } from "@/lib/types";

const REASONS: ReturnReason[] = ["Customer not available", "Phone switched off", "Customer refused parcel", "Wrong or incomplete address", "Customer asked to reschedule"];

function downloadCsv(rows: (string | number)[][], name: string) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminOverview() {
  const { state } = useStore();
  const today = state.parcels.filter((p) => isToday(p.createdAt) || (p.attempt && isToday(p.attempt.at)) || p.status === "out" || p.status === "handed");
  const closed = state.parcels.filter((p) => p.attempt && isToday(p.attempt.at));
  const delivered = closed.filter((p) => p.attempt!.outcome === "delivered");
  const returned = closed.filter((p) => p.attempt!.outcome === "returned");
  const flagged = returned.filter((p) => p.flags.length);
  const onRoad = state.parcels.filter((p) => p.status === "out").length;
  const rate = closed.length ? (returned.length / closed.length) * 100 : 0;
  const codCollected = delivered.reduce((s, p) => s + p.cod, 0);
  const withRiders = state.riders.reduce((s, r) => s + cashInHand(state, r.id).inHand, 0);

  // hours 9am-8pm
  const hours = Array.from({ length: 12 }, (_, i) => 9 + i).map((h) => {
    const inHour = closed.filter((p) => new Date(p.attempt!.at).getHours() === h);
    const d = inHour.filter((p) => p.attempt!.outcome === "delivered").length;
    return { h, d, r: inHour.length - d, label: h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a` };
  });
  const maxH = Math.max(4, ...hours.map((x) => x.d + x.r));
  const axisMax = Math.ceil(maxH / 4) * 4;

  const reasons = REASONS.map((r) => ({ r, n: returned.filter((p) => p.attempt!.reason === r).length })).filter((x) => x.n);

  const riders = state.riders
    .map((r) => {
      const c = closed.filter((p) => p.riderId === r.id);
      const ret = c.filter((p) => p.attempt!.outcome === "returned");
      const fl = ret.filter((p) => p.flags.length).length;
      const calls = ret.length ? ret.reduce((s, p) => s + p.attempt!.calls, 0) / ret.length : 0;
      const away = c.filter((p) => p.attempt!.distanceM > 300).length;
      const rRate = c.length ? (ret.length / c.length) * 100 : 0;
      const status = c.length >= 3 && (rRate > rate + 8 || fl >= 3) ? "Review" : fl >= 1 && rRate > rate ? "Watch" : "Normal";
      return { r, n: c.length, d: c.length - ret.length, ret: ret.length, rRate, fl, calls, away, status };
    })
    .sort((a, b) => b.rRate - a.rRate);

  const custody = [
    { label: "Waiting for a label", n: state.parcels.filter((p) => p.status === "new").length, bg: "var(--ground)", fg: "var(--ink)" },
    { label: "Ready for handover", n: state.parcels.filter((p) => p.status === "labeled").length, bg: "var(--ground)", fg: "var(--ink)" },
    { label: "Handed over, rider hasn't scanned", n: state.parcels.filter((p) => p.status === "handed").length, bg: "var(--amber-soft)", fg: "var(--amber-ink)" },
    { label: "Out for delivery", n: onRoad, bg: "var(--navy-soft)", fg: "var(--navy)" },
    { label: "Returns not yet back at warehouse", n: state.parcels.filter((p) => p.status === "returned").length, bg: "var(--red-soft)", fg: "var(--red)" },
  ];

  function exportDay() {
    downloadCsv(
      [
        ["Order", "Tracking", "Customer", "Area", "Rider", "Outcome", "Reason", "Time", "COD", "Calls", "Distance m", "Flags"],
        ...closed.map((p) => [p.id, p.trk, p.customer, p.area, state.riders.find((r) => r.id === p.riderId)?.name ?? "", p.attempt!.outcome, p.attempt!.reason ?? "", time(p.attempt!.at), p.cod, p.attempt!.calls, p.attempt!.distanceM, p.flags.join("; ")]),
      ],
      `rider-trace-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  const tile = { background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column" as const, gap: 6 };
  const big = { fontSize: 30, fontWeight: 700, lineHeight: 1 };

  return (
    <main style={{ padding: "26px 32px 48px", display: "flex", flexDirection: "column", gap: 22, maxWidth: 1240 }}>
      <div className="row between wrap" style={{ alignItems: "flex-end", gap: 14 }}>
        <div>
          <div className="small muted">{new Date().toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 style={{ fontSize: 26 }}>Today&apos;s deliveries</h1>
        </div>
        <button type="button" className="btn navy" onClick={exportDay}>Export daily report (CSV)</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }} className="num">
        <div style={tile}><span className="xs muted">Orders today</span><span style={big}>{today.length}</span><span className="xs muted">{onRoad} still on the road</span></div>
        <div style={tile}><span className="xs muted">Delivered</span><span style={{ ...big, color: "var(--green)" }}>{delivered.length}</span><span className="xs muted">{closed.length ? Math.round((delivered.length / closed.length) * 100) : 0}% of closed parcels</span></div>
        <div style={tile}><span className="xs muted">Returned</span><span style={{ ...big, color: "var(--amber)" }}>{returned.length}</span><span className="xs muted">Return rate {rate.toFixed(1)}%</span></div>
        <div style={{ ...tile, background: "var(--red)", border: 0, color: "#fff" }}>
          <span className="xs" style={{ color: "#f7d9d9" }}>Flagged returns</span>
          <span style={big}>{flagged.length}</span>
          <Link href="/admin/review" className="xs" style={{ color: "#fff", fontWeight: 600 }}>Review now →</Link>
        </div>
        <div style={tile}><span className="xs muted">COD collected</span><span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{pkr(codCollected)}</span><span className="xs muted">{pkr(withRiders)} still with riders</span></div>
      </div>

      <div className="row wrap" style={{ gap: 16, alignItems: "stretch" }}>
        <section className="card pad-lg stack" style={{ flex: "3 1 420px", minWidth: 0 }}>
          <div className="row between wrap">
            <h2>Closed parcels by hour</h2>
            <div className="row xs muted" style={{ gap: 14 }}>
              <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--navy)" }} />Delivered</span>
              <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--orange)" }} />Returned</span>
            </div>
          </div>
          <div className="row" style={{ alignItems: "stretch", gap: 8 }}>
            <div className="xs muted num" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 160, textAlign: "right" }}>
              <span>{axisMax}</span><span>{axisMax / 2}</span><span>0</span>
            </div>
            <div className="grow stack" style={{ gap: 6 }}>
              <div style={{ height: 160, display: "flex", alignItems: "flex-end", gap: 6, borderBottom: "1px solid var(--line-2)", backgroundImage: "linear-gradient(#eef1f5 1px, transparent 1px)", backgroundSize: "100% 80px" }}>
                {hours.map((x) => (
                  <div key={x.h} title={`${x.label}: ${x.d} delivered, ${x.r} returned`} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2 }}>
                    {x.r > 0 && <div style={{ height: `${(x.r / axisMax) * 100}%`, background: "var(--orange)", borderRadius: "3px 3px 0 0" }} />}
                    {x.d > 0 && <div style={{ height: `${(x.d / axisMax) * 100}%`, background: "var(--navy)", borderRadius: "3px 3px 0 0" }} />}
                  </div>
                ))}
              </div>
              <div className="row xs muted" style={{ gap: 6 }}>
                {hours.map((x) => <span key={x.h} style={{ flex: 1, textAlign: "center" }}>{x.label}</span>)}
              </div>
            </div>
          </div>
        </section>

        <section className="card pad-lg stack" style={{ flex: "2 1 300px", minWidth: 0 }}>
          <h2>Why parcels came back</h2>
          {reasons.length === 0 && <div className="small muted">No returns today.</div>}
          {reasons.map((x) => {
            const pct = Math.round((x.n / returned.length) * 100);
            return (
              <div key={x.r} className="stack" style={{ gap: 5 }}>
                <div className="row between small"><span>{x.r}</span><b className="num">{x.n} · {pct}%</b></div>
                <div style={{ height: 8, background: "#eef1f5", borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: "var(--orange)", borderRadius: 4 }} /></div>
              </div>
            );
          })}
        </section>
      </div>

      <section className="card pad-lg stack">
        <div className="row between wrap">
          <h2>Riders today</h2>
          <span className="row xs muted" style={{ gap: 6 }}><span style={{ width: 2, height: 14, background: "var(--ink)" }} />Team return rate {rate.toFixed(1)}%</span>
        </div>
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 820 }}>
            <thead>
              <tr><th>Rider</th><th>Closed</th><th>Delivered</th><th>Returned</th><th style={{ width: 220 }}>Return rate</th><th>Calls per return</th><th>Marked away from address</th><th>Status</th></tr>
            </thead>
            <tbody>
              {riders.map((x) => (
                <tr key={x.r.id} style={{ background: x.status === "Review" ? "#fff7f6" : undefined }}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="avatar">{initials(x.r.name)}</span>
                      <span><b style={{ display: "block" }}>{x.r.name}</b><span className="xs muted mono">{x.r.id}</span></span>
                    </div>
                  </td>
                  <td>{x.n}</td>
                  <td>{x.d}</td>
                  <td>{x.ret}</td>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <b style={{ width: 46, color: x.status === "Review" ? "var(--red)" : undefined }}>{x.rRate.toFixed(1)}%</b>
                      <div style={{ position: "relative", flex: 1, height: 8, background: "#eef1f5", borderRadius: 4 }}>
                        <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${Math.min(100, (x.rRate / 30) * 100)}%`, borderRadius: 4, background: x.status === "Review" ? "var(--red)" : x.status === "Watch" ? "var(--orange)" : "var(--navy)" }} />
                        <div style={{ position: "absolute", top: -4, bottom: -4, width: 2, background: "var(--ink)", left: `${Math.min(100, (rate / 30) * 100)}%` }} />
                      </div>
                    </div>
                  </td>
                  <td>{x.calls.toFixed(1)}</td>
                  <td>{x.away}</td>
                  <td><span className={`pill ${x.status === "Review" ? "bad" : x.status === "Watch" ? "warn" : "good"}`}>{x.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="row wrap" style={{ gap: 16, alignItems: "stretch" }}>
        <section className="card pad-lg stack" style={{ flex: "3 1 440px", minWidth: 0, gap: 8 }}>
          <div className="row between"><h2>Flagged returns to review</h2><Link href="/admin/review" className="small" style={{ fontWeight: 600 }}>Open review queue →</Link></div>
          {flagged.filter((p) => !p.review).length === 0 && <div className="small muted">Nothing left to review.</div>}
          {flagged
            .filter((p) => !p.review)
            .sort((a, b) => b.attempt!.at - a.attempt!.at)
            .slice(0, 6)
            .map((p) => (
              <Link key={p.id} href={`/admin/review?id=${encodeURIComponent(p.id)}`} className="row wrap" style={{ gap: "10px 14px", padding: "12px 0", borderTop: "1px solid #eef1f5", textDecoration: "none", color: "var(--ink)" }}>
                <span style={{ minWidth: 150 }}>
                  <span className="mono" style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{p.trk}</span>
                  <span className="xs muted">{state.riders.find((r) => r.id === p.riderId)?.name} · {time(p.attempt!.at)}</span>
                </span>
                <span className="grow small" style={{ minWidth: 160 }}>{p.attempt!.reason}</span>
                <span className="row wrap" style={{ gap: 6 }}>{p.flags.map((f) => <span key={f} className="flag">{f}</span>)}</span>
              </Link>
            ))}
        </section>

        <section className="card pad-lg stack" style={{ flex: "2 1 300px", minWidth: 0 }}>
          <h2>Custody right now</h2>
          {custody.map((c) => (
            <div key={c.label} className="row between" style={{ padding: "10px 12px", borderRadius: 9, background: c.bg, color: c.fg }}>
              <span>{c.label}</span><b className="num">{c.n}</b>
            </div>
          ))}
          <div className="xs muted">Every parcel sits with exactly one person at a time: warehouse, rider, or customer.</div>
        </section>
      </div>
    </main>
  );
}
