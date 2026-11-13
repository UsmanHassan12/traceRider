"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { StatusPill } from "@/components/StatusPill";
import { useToast } from "@/components/Toast";
import { toParcel, type ParcelRow } from "@/lib/db";
import { STATUS, pkr } from "@/lib/format";
import { archiveStale, useStore } from "@/lib/store";
import { sb } from "@/lib/supabase";
import type { Parcel } from "@/lib/types";

type Filter = "all" | "desk" | "rider";
const PAGE = 25;
const DAYS = 7;
const FROM: Record<Filter, string[] | null> = {
  all: null,
  desk: ["new", "labeled"],
  rider: ["handed", "out"],
};

const day = (t?: number) => (t ? new Date(t).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : "—");
const daysSince = (t: number) => Math.max(0, Math.floor((Date.now() - t) / 864e5));

export default function ArchivePage() {
  const { state, me, reload } = useStore();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Parcel[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<Filter, number>>({ all: 0, desk: 0, rider: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<Parcel | null>(null);
  const [busy, setBusy] = useState(false);

  // wait for typing to pause before searching the database
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [filter, search]);

  const riderName = (id?: string) => state.riders.find((r) => r.id === id)?.name ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = sb();
      let query = client.from("parcels").select("*", { count: "exact" }).eq("status", "archived");
      const from = FROM[filter];
      if (from) query = query.in("archived_from", from);
      if (search) {
        const s = search.replace(/[%,()"]/g, " ");
        query = query.or(`id.ilike.%${s}%,trk.ilike.%${s}%,customer.ilike.%${s}%,phone.ilike.%${s}%,area.ilike.%${s}%`);
      }
      const { data, count, error: e } = await query.order("archived_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (e) throw new Error(e.message);
      setRows(((data ?? []) as ParcelRow[]).map((r) => toParcel(r, [])));
      setTotal(count ?? 0);

      const head = (f: Filter) => {
        let c = client.from("parcels").select("id", { count: "exact", head: true }).eq("status", "archived");
        if (FROM[f]) c = c.in("archived_from", FROM[f]!);
        return c.then((r) => r.count ?? 0);
      };
      const [all, desk, rider] = await Promise.all([head("all"), head("desk"), head("rider")]);
      setCounts({ all, desk, rider });
    } catch (err) {
      const msg = (err as Error).message;
      setError(/archived_from|archived_at|parcels_status_check/.test(msg) ? "Run supabase/migrations/005_archive.sql in Supabase › SQL Editor to turn on the archive." : msg);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function archiveNow() {
    setBusy(true);
    const n = await archiveStale();
    setBusy(false);
    toast(n ? `${n} order${n === 1 ? "" : "s"} moved to the archive.` : `Nothing to archive. Every open order is less than ${DAYS} days old.`, n ? "good" : "plain");
    if (n) {
      await reload();
      await load();
    }
  }

  async function restore() {
    if (!restoring) return;
    const p = restoring;
    const back = p.archivedFrom && p.archivedFrom !== "archived" ? p.archivedFrom : "labeled";
    setBusy(true);
    const client = sb();
    const now = new Date().toISOString();
    const { error: e } = await client
      .from("parcels")
      .update({ status: back, archived_from: null, archived_at: null, restored_at: now })
      .eq("id", p.id)
      .eq("status", "archived");
    if (!e) {
      await client.from("parcel_events").insert({
        parcel_id: p.id,
        at: now,
        what: `Restored from archive to "${STATUS[back].label}" (another ${DAYS} days)`,
        by: me?.name ?? "Admin",
        kind: "info",
      });
    }
    setBusy(false);
    setRestoring(null);
    if (e) {
      toast(`Could not restore ${p.id}: ${e.message}`, "bad");
      return;
    }
    toast(`${p.id} is back in Orders as "${STATUS[back].label}".`, "good");
    await reload();
    await load();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const chips: [Filter, string][] = [
    ["all", "All archived"],
    ["rider", "Was with a rider"],
    ["desk", "Never left the desk"],
  ];

  return (
    <main className="adm-main">
      <div className="row between wrap" style={{ gap: 12, alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Archive</h1>
          <div className="small muted">
            Orders not delivered within {DAYS} days of arriving from Shopify move here automatically every night. Nothing is deleted.
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, background: "#fff", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 12px", minHeight: 44, width: "min(300px, 100%)" }}>
            <Icon name="search" size={18} color="var(--muted)" />
            <input
              aria-label="Search the archive"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Order, customer, phone, area"
              style={{ border: 0, outline: 0, flex: 1, minWidth: 0, font: "inherit", background: "transparent" }}
            />
          </div>
          <button type="button" className="btn" onClick={archiveNow} disabled={busy}>
            <Icon name="clock" size={16} /> Archive now
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }} className="num">
        <Tile label="In the archive" value={counts.all} />
        <Tile label="Were with a rider" value={counts.rider} tone={counts.rider ? "var(--red)" : undefined} />
        <Tile label="Never left the desk" value={counts.desk} />
      </div>

      <section className="card pad-lg stack">
        <div className="row between wrap" style={{ gap: 8 }}>
          <h2>Archived orders</h2>
          <div className="row" style={{ gap: 6, overflowX: "auto" }}>
            {chips.map(([f, l]) => (
              <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {l} {counts[f]}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="card" style={{ padding: 12, background: "#fff4f4", borderColor: "#f3c7c7", color: "var(--red)" }}>
            <Icon name="alert" size={16} /> {error}
          </div>
        )}

        <div className="table-wrap">
          <table className="data" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Was</th>
                <th>Rider</th>
                <th>Arrived</th>
                <th>Archived</th>
                <th>COD</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>Loading the archive…</td></tr>
              )}
              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    {search ? "No archived order matches that search." : `The archive is empty. Orders land here when they are still not delivered after ${DAYS} days.`}
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr key={p.id} style={{ opacity: loading ? 0.6 : 1 }}>
                  <td>
                    <b>{p.id}</b>
                    <div className="xs muted num">{p.trk}</div>
                  </td>
                  <td>
                    {p.customer}
                    <div className="xs muted">{[p.phone, p.area].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>{p.archivedFrom && p.archivedFrom !== "archived" ? <StatusPill status={p.archivedFrom} /> : <span className="xs muted">—</span>}</td>
                  <td className="small">{riderName(p.riderId) || <span className="muted">—</span>}</td>
                  <td className="small">
                    {day(p.createdAt)}
                    <div className="xs muted">{daysSince(p.createdAt)} days ago</div>
                  </td>
                  <td className="small">{day(p.archivedAt)}</td>
                  <td className="num">{p.cod ? pkr(p.cod) : <span className="xs muted">Prepaid</span>}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="btn sm" onClick={() => setRestoring(p)}>
                      <Icon name="undo" size={14} /> Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <nav className="pager" aria-label="Pages of archived orders">
            <span className="xs muted num">
              {page * PAGE + 1}–{Math.min(total, page * PAGE + PAGE)} of {total}
            </span>
            <div className="row" style={{ gap: 4 }}>
              <button type="button" className="btn sm ghost pager-btn" disabled={page === 0 || loading} onClick={() => setPage(page - 1)} aria-label="Previous page">
                <Icon name="back" size={16} /> Prev
              </button>
              <span className="xs num pager-count">{page + 1} / {pages}</span>
              <button type="button" className="btn sm ghost pager-btn" disabled={page >= pages - 1 || loading} onClick={() => setPage(page + 1)} aria-label="Next page">
                Next <Icon name="chevron" size={16} />
              </button>
            </div>
          </nav>
        )}
      </section>

      {restoring && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && !busy && setRestoring(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ar-title">
            <h2 id="ar-title">Restore {restoring.id}?</h2>
            <div className="small">
              {restoring.customer} · {restoring.area || restoring.address}
            </div>
            <div className="small muted">
              It goes back to <b>{STATUS[restoring.archivedFrom && restoring.archivedFrom !== "archived" ? restoring.archivedFrom : "labeled"].label}</b>
              {riderName(restoring.riderId) ? ` with ${riderName(restoring.riderId)}` : ""} and shows in Orders again. It gets another {DAYS} days before it can be archived again.
              If it was in fact delivered, restore it and mark it delivered in Orders.
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setRestoring(null)} disabled={busy}>Cancel</button>
              <button type="button" className="btn navy" onClick={restore} disabled={busy}>
                <Icon name="undo" size={16} /> {busy ? "Restoring…" : "Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="xs muted">{label}</span>
      <span style={{ fontSize: 26, fontWeight: 700, color: tone }}>{value}</span>
    </div>
  );
}
