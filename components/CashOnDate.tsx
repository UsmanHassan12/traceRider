"use client";

import { useEffect, useMemo, useState } from "react";
import { Pager, usePaged } from "./Pager";
import { initials, pkr, time } from "@/lib/format";
import { dayEnd, dayStart, deliveredUpTo, depositsUpTo, downloadCsv } from "@/lib/history";
import { useStore } from "@/lib/store";
import type { Deposit, Parcel } from "@/lib/types";

/**
 * Cash on one past day: what each rider collected and handed in that day, and what he still held
 * at the end of it. Read from the database, so it works for any date, not only the last 10 days.
 */
export function CashOnDate({ day }: { day: string }) {
  const { state } = useStore();
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const start = dayStart(day);
  const end = dayEnd(day);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([deliveredUpTo(end), depositsUpTo(end)])
      .then(([p, d]) => {
        if (!live) return;
        setParcels(p);
        setDeposits(d);
      })
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [end]);

  const riderName = (id?: string) => state.riders.find((r) => r.id === id)?.name ?? id ?? "—";
  const inDay = (t: number) => t >= start && t <= end;

  const rows = useMemo(() => {
    const ids = new Set<string>([...state.riders.map((r) => r.id), ...parcels.map((p) => p.riderId ?? ""), ...deposits.map((d) => d.riderId)].filter(Boolean));
    return Array.from(ids)
      .map((id) => {
        const del = parcels.filter((p) => p.riderId === id && p.attempt);
        const dep = deposits.filter((d) => d.riderId === id);
        const owedBy = (t: number) => Math.max(0, del.filter((p) => p.attempt!.at <= t).reduce((s, p) => s + p.cod, 0) - dep.filter((d) => d.at <= t).reduce((s, d) => s + d.amount, 0));
        const collected = del.filter((p) => inDay(p.attempt!.at));
        return {
          id,
          opening: owedBy(start - 1),
          collected: collected.reduce((s, p) => s + p.cod, 0),
          deliveries: collected.length,
          handedIn: dep.filter((d) => inDay(d.at)).reduce((s, d) => s + d.amount, 0),
          closing: owedBy(end),
        };
      })
      .filter((r) => r.opening || r.collected || r.handedIn || r.closing)
      .sort((a, b) => b.closing - a.closing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcels, deposits, state.riders, start, end]);

  const handovers = useMemo(() => deposits.filter((d) => inDay(d.at)).sort((a, b) => b.at - a.at), [deposits, start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const pgR = usePaged(rows, 12, day);
  const pgH = usePaged(handovers, 10, day);

  const total = (k: "collected" | "handedIn" | "closing" | "opening") => rows.reduce((s, r) => s + r[k], 0);
  const label = new Date(`${day}T12:00:00`).toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function exportCsv() {
    downloadCsv(
      [
        ["Date", "Rider", "Held at start of day", "COD deliveries", "Collected", "Handed in", "Held at end of day"],
        ...rows.map((r) => [day, riderName(r.id), r.opening, r.deliveries, r.collected, r.handedIn, r.closing]),
        [],
        ["Handover time", "Rider", "Rider declared", "Counted", "Counted by", "Status", "Rider note"],
        ...handovers.map((d) => [new Date(d.at).toLocaleString("en-PK"), riderName(d.riderId), d.declared ?? "", d.amount, d.by, d.status ?? "confirmed", d.riderNote ?? ""]),
      ],
      `cash-${day}.csv`
    );
  }

  const tile = { background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column" as const, gap: 4 };

  if (error) return <div className="card pad-lg small" style={{ color: "var(--red)" }}>Could not load cash for {label}: {error}</div>;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, opacity: loading ? 0.5 : 1 }} className="num">
        <div style={tile}><span className="xs muted">With riders at start of day</span><span style={{ fontSize: 22, fontWeight: 700 }}>{pkr(total("opening"))}</span></div>
        <div style={tile}><span className="xs muted">COD collected that day</span><span style={{ fontSize: 22, fontWeight: 700 }}>{pkr(total("collected"))}</span></div>
        <div style={tile}><span className="xs muted">Handed in that day</span><span style={{ fontSize: 22, fontWeight: 700, color: "var(--green)" }}>{pkr(total("handedIn"))}</span><span className="xs muted">{handovers.length} handover{handovers.length === 1 ? "" : "s"}</span></div>
        <div style={tile}><span className="xs muted">With riders at end of day</span><span style={{ fontSize: 22, fontWeight: 700, color: total("closing") ? "var(--red)" : undefined }}>{pkr(total("closing"))}</span></div>
      </div>

      <section className="card pad-lg stack">
        <div className="row between wrap" style={{ gap: 8 }}>
          <div>
            <h2>Riders on {label}</h2>
            <div className="xs muted">Held at end of day = everything collected up to that night, minus everything handed in.</div>
          </div>
          <button type="button" className="btn sm" onClick={exportCsv} disabled={loading || rows.length === 0}>Export CSV</button>
        </div>
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 720 }}>
            <thead><tr><th>Rider</th><th>Held at start</th><th>COD deliveries</th><th>Collected</th><th>Handed in</th><th>Held at end</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 22 }}>Loading…</td></tr>}
              {!loading && pgR.rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 22 }}>No cash movement that day.</td></tr>}
              {!loading && pgR.rows.map((r) => (
                <tr key={r.id}>
                  <td><div className="row" style={{ gap: 10 }}><span className="avatar">{initials(riderName(r.id))}</span><b>{riderName(r.id)}</b></div></td>
                  <td className="num">{r.opening ? pkr(r.opening) : "—"}</td>
                  <td className="num">{r.deliveries}</td>
                  <td className="num">{r.collected ? pkr(r.collected) : "—"}</td>
                  <td className="num" style={{ color: r.handedIn ? "var(--green)" : undefined }}>{r.handedIn ? pkr(r.handedIn) : "—"}</td>
                  <td className="num"><b style={{ color: r.closing ? "var(--red)" : "var(--muted)" }}>{pkr(r.closing)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager {...pgR} label="riders" />
      </section>

      <section className="card pad-lg stack">
        <h2>Handovers that day</h2>
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 620 }}>
            <thead><tr><th>Time</th><th>Rider</th><th>Rider declared</th><th>Counted</th><th>Counted by</th><th>Status</th></tr></thead>
            <tbody>
              {!loading && pgH.rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>No cash was handed in that day.</td></tr>}
              {pgH.rows.map((d, i) => (
                <tr key={d.id ?? `${d.at}-${i}`}>
                  <td className="small">{time(d.at)}</td>
                  <td><b>{riderName(d.riderId)}</b>{d.riderNote && <div className="xs" style={{ color: "var(--red)" }}>&ldquo;{d.riderNote}&rdquo;</div>}</td>
                  <td className="num">{d.declared !== undefined ? pkr(d.declared) : <span className="xs muted">No QR</span>}</td>
                  <td className="num"><b>{pkr(d.amount)}</b></td>
                  <td className="small">{d.by}</td>
                  <td>
                    {d.status === "pending" ? <span className="pill warn">Waiting for rider</span> : d.status === "disputed" ? <span className="pill bad">Disputed</span> : d.status === "resolved" ? <span className="pill info">Resolved</span> : <span className="pill good">Confirmed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager {...pgH} label="handovers" />
      </section>
    </>
  );
}
