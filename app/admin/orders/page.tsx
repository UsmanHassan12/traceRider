"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { StatusPill } from "@/components/StatusPill";
import { useToast } from "@/components/Toast";
import { fulfillInShopify } from "@/lib/api";
import { ago, pkr, time } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Parcel, ReturnReason } from "@/lib/types";

type Filter = "open" | "riders" | "delivered" | "returned" | "shopify" | "all";
const PAGE = 25;
const REASONS: ReturnReason[] = ["Customer not available", "Phone switched off", "Customer refused parcel", "Wrong or incomplete address", "Customer asked to reschedule"];

export default function OrdersPage() {
  const { state, adminSetOutcome, receiveReturn } = useStore();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("riders");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [marking, setMarking] = useState<{ p: Parcel; outcome: "delivered" | "returned" } | null>(null);
  const [reason, setReason] = useState<ReturnReason>("Customer not available");
  const [note, setNote] = useState("");
  const [logFor, setLogFor] = useState<Parcel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const riderName = (id?: string) => state.riders.find((r) => r.id === id)?.name ?? "";
  const lastAt = (p: Parcel) => p.events[p.events.length - 1]?.at ?? p.createdAt;

  const groups: Record<Filter, (p: Parcel) => boolean> = {
    open: (p) => ["new", "labeled", "handed", "out", "returned"].includes(p.status),
    riders: (p) => p.status === "handed" || p.status === "out",
    delivered: (p) => p.status === "delivered",
    returned: (p) => p.status === "returned" || p.status === "received",
    shopify: (p) => !!p.shopifySync?.startsWith("error"),
    all: () => true,
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.parcels
      .filter(groups[filter])
      .filter((p) => !s || [p.id, p.trk, p.customer, p.phone, p.area, riderName(p.riderId)].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => lastAt(b) - lastAt(a));
  }, [state.parcels, state.riders, filter, q]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = list.slice(cur * PAGE, cur * PAGE + PAGE);
  const count = (f: Filter) => state.parcels.filter(groups[f]).length;

  function openMark(p: Parcel, outcome: "delivered" | "returned") {
    setMarking({ p, outcome });
    setReason(p.attempt?.reason ?? "Customer not available");
    setNote("");
  }

  function saveMark() {
    if (!marking) return;
    const r = adminSetOutcome(marking.p.id, marking.outcome, reason, note.trim());
    toast(r.message, r.ok ? "good" : "bad");
    setMarking(null);
  }

  async function retry(p: Parcel) {
    setBusy(p.id);
    const r = await fulfillInShopify([p.id]);
    setBusy(null);
    toast(r.ok ? `${p.id} marked fulfilled in Shopify.` : r.results?.[0]?.message ?? r.message ?? "Shopify could not be updated.", r.ok ? "good" : "bad");
  }

  const chips: [Filter, string][] = [
    ["riders", "With riders"],
    ["open", "All open"],
    ["delivered", "Delivered"],
    ["returned", "Returned"],
    ["shopify", "Shopify issues"],
    ["all", "All"],
  ];

  return (
    <main className="adm-main">
      <div className="row between wrap" style={{ gap: 12, alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Orders</h1>
          <div className="small muted">Confirmed Islamabad and Rawalpindi orders from Shopify, last 10 days plus anything still open.</div>
        </div>
        <div className="row" style={{ gap: 8, background: "#fff", border: "1px solid var(--line-2)", borderRadius: 10, padding: "0 12px", minHeight: 44, width: "min(320px, 100%)" }}>
          <Icon name="search" size={18} color="var(--muted)" />
          <label htmlFor="ord-q" className="sr-only">Search orders</label>
          <input id="ord-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Order, customer, phone, rider" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent" }} />
        </div>
      </div>

      <div className="row" style={{ gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {chips.map(([f, label]) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => { setFilter(f); setPage(0); }}>
            {label} {count(f)}
          </button>
        ))}
      </div>

      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 16 }}>Order</th><th>Customer</th><th>Rider</th><th>Status</th><th>Shopify</th><th>COD</th><th>Last update</th><th style={{ textAlign: "right", paddingRight: 16 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 28 }}>No orders here.</td></tr>
              )}
              {shown.map((p) => (
                <tr key={p.id}>
                  <td style={{ paddingLeft: 16 }}>
                    <b style={{ display: "block" }}>{p.id}</b>
                    <span className="mono xs muted">{p.trk}</span>
                  </td>
                  <td style={{ maxWidth: 240 }}>
                    <div style={{ fontWeight: 500 }}>{p.customer}</div>
                    <div className="xs muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.area} · {p.phone}</div>
                  </td>
                  <td className="small">{riderName(p.riderId) || <span className="muted">—</span>}</td>
                  <td>
                    <StatusPill status={p.status} />
                    {p.attempt?.byAdmin && <div className="xs muted" style={{ marginTop: 3 }}>by admin</div>}
                    {p.attempt?.outcome === "returned" && <div className="xs" style={{ color: "var(--red)", marginTop: 3 }}>{p.attempt.reason}</div>}
                  </td>
                  <td><ShopifyBadge p={p} /></td>
                  <td className="num">{pkr(p.cod)}</td>
                  <td className="xs muted">{ago(lastAt(p))} ago</td>
                  <td style={{ paddingRight: 16 }}>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      {(p.status === "handed" || p.status === "out") && (
                        <>
                          <button type="button" className="btn sm green" onClick={() => openMark(p, "delivered")}>Delivered</button>
                          <button type="button" className="btn sm danger-outline" onClick={() => openMark(p, "returned")}>Returned</button>
                        </>
                      )}
                      {p.status === "delivered" && <button type="button" className="btn sm" onClick={() => openMark(p, "returned")}>Change to returned</button>}
                      {p.status === "returned" && (
                        <>
                          <button type="button" className="btn sm" onClick={() => { const r = receiveReturn(p.trk); toast(r.message, r.ok ? "good" : "bad"); }}>Check in</button>
                          <button type="button" className="btn sm" onClick={() => openMark(p, "delivered")}>Change to delivered</button>
                        </>
                      )}
                      {p.shopifySync?.startsWith("error") && (
                        <button type="button" className="btn sm" disabled={busy === p.id} onClick={() => retry(p)}>{busy === p.id ? "Retrying…" : "Retry Shopify"}</button>
                      )}
                      <button type="button" className="btn sm ghost" onClick={() => setLogFor(p)} aria-label={`History of ${p.id}`}>
                        <Icon name="clock" size={16} /> Log
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager" style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
          <span className="xs muted">{list.length === 0 ? "0" : `${cur * PAGE + 1}–${Math.min(list.length, cur * PAGE + PAGE)}`} of {list.length}</span>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}><Icon name="back" size={16} /> Previous</button>
            <span className="xs muted">Page {cur + 1} of {pages}</span>
            <button type="button" className="btn sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next <Icon name="chevron" size={16} /></button>
          </div>
        </div>
      </section>

      {marking && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setMarking(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="mk-title">
            <h2 id="mk-title">Mark {marking.p.id} as {marking.outcome}</h2>
            <div className="small muted">
              {marking.p.customer} · {marking.p.area} · {riderName(marking.p.riderId) || "no rider"} · COD {pkr(marking.p.cod)}
            </div>
            {marking.outcome === "returned" && (
              <div className="field">
                <label htmlFor="mk-reason">Reason</label>
                <select id="mk-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)}>
                  {REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="mk-note">Note (optional)</label>
              <input id="mk-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={marking.outcome === "delivered" ? "e.g. confirmed with customer by phone" : "e.g. customer cancelled on call"} />
            </div>
            <div className="xs muted">This is saved in the parcel&apos;s custody log with your name. It does not change the order in Shopify.</div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setMarking(null)}>Cancel</button>
              <button type="button" className={`btn ${marking.outcome === "delivered" ? "green" : "red"}`} onClick={saveMark}>
                Mark {marking.outcome}
              </button>
            </div>
          </div>
        </div>
      )}

      {logFor && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setLogFor(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="log-title" style={{ width: "min(560px, 100%)" }}>
            <h2 id="log-title">{logFor.id} · {logFor.customer}</h2>
            <div className="small muted">{logFor.address} · {logFor.phone}</div>
            <ol className="scroll-box" style={{ listStyle: "none", margin: 0, padding: "0 0 0 16px", borderLeft: "2px solid var(--line)", display: "flex", flexDirection: "column", gap: 10, maxHeight: "50vh" }}>
              {(state.parcels.find((x) => x.id === logFor.id) ?? logFor).events.map((e, i) => (
                <li key={i} className="small" style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: -23, top: 5, width: 12, height: 12, borderRadius: "50%", border: "2px solid #fff", background: e.kind === "bad" ? "var(--red)" : e.kind === "good" ? "var(--green)" : "var(--navy)" }} />
                  <span className="mono muted">{new Date(e.at).toLocaleDateString("en-PK", { day: "numeric", month: "short" })} {time(e.at)}</span> · {e.what} <span className="xs muted">· {e.by}</span>
                </li>
              ))}
            </ol>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn navy" onClick={() => setLogFor(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ShopifyBadge({ p }: { p: Parcel }) {
  if (!p.shopifyOrderId) return <span className="xs muted">Not from Shopify</span>;
  if (p.shopifySync === "fulfilled") return <span className="pill good">Fulfilled</span>;
  if (p.shopifySync?.startsWith("error")) return <span className="pill bad" title={p.shopifySync.slice(7)}>Not updated</span>;
  if (p.status === "new" || p.status === "labeled") return <span className="pill info">Unfulfilled</span>;
  return <span className="pill warn">Pending</span>;
}
