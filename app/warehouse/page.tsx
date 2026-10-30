"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { LabelSheet } from "@/components/LabelSheet";
import { PrintLabels } from "@/components/PrintLabels";
import { useToast } from "@/components/Toast";
import { fulfillInShopify } from "@/lib/api";
import { ago, initials, pkr, time } from "@/lib/format";
import { cashInHand, useStore } from "@/lib/store";
import type { Parcel } from "@/lib/types";

type Banner = { tone: "good" | "bad"; title: string; sub?: string; undo?: () => void } | null;

const BATCH = 50; // labels per print run

export default function WarehouseDesk() {
  const { ready, state, me, addTestOrder, printLabel, printLabels, handover, receiveReturn, deposit, signOut } = useStore();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [riderId, setRiderId] = useState<string | null>(null);
  const [tray, setTray] = useState<string[]>([]);
  const [banner, setBanner] = useState<Banner>(null);
  const [printing, setPrinting] = useState<Parcel[] | null>(null);
  const [cashFor, setCashFor] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ready && !riderId && state.riders[0]) setRiderId(state.riders[0].id);
  }, [ready, riderId, state.riders]);

  if (!ready) return <div aria-busy="true" />;

  const rider = state.riders.find((r) => r.id === riderId) ?? null;
  const match = (p: Parcel) => {
    const s = q.trim().toLowerCase();
    return !s || [p.id, p.trk, p.customer, p.area, p.phone].some((x) => x.toLowerCase().includes(s));
  };
  const toLabel = state.parcels.filter((p) => p.status === "new").sort((a, b) => a.createdAt - b.createdAt);
  const toLabelShown = toLabel.filter(match);
  const ready4 = state.parcels.filter((p) => p.status === "labeled" && !tray.includes(p.trk)).filter(match);
  const returning = state.parcels.filter((p) => p.status === "returned").sort((a, b) => (a.attempt?.at ?? 0) - (b.attempt?.at ?? 0));
  const trayParcels = tray.map((t) => state.parcels.find((p) => p.trk === t)).filter((p): p is Parcel => !!p);
  const trayTotal = trayParcels.reduce((s, p) => s + p.cod, 0);
  const shopifyErrors = state.parcels.filter((p) => p.shopifySync?.startsWith("error") && ["handed", "out"].includes(p.status));

  function addToTray(p: Parcel) {
    if (!rider) {
      setBanner({ tone: "bad", title: "Pick the rider first", sub: "Choose who is taking the parcels, then scan again." });
      return;
    }
    if (tray.includes(p.trk)) {
      setBanner({ tone: "bad", title: `${p.trk} is already in this handover` });
      return;
    }
    setTray((t) => [...t, p.trk]);
    setBanner({
      tone: "good",
      title: `${p.trk} added to ${rider.name.split(" ")[0]}'s handover`,
      sub: `${p.customer} · ${p.area} · COD ${pkr(p.cod)} · ${time(Date.now())}`,
      undo: () => {
        setTray((t) => t.filter((x) => x !== p.trk));
        setBanner(null);
      },
    });
  }

  function onScan(e: React.FormEvent) {
    e.preventDefault();
    const raw = code.trim();
    setCode("");
    if (!raw) return;
    if (raw.startsWith("DEPOSIT|")) {
      const rid = raw.split("|")[1];
      if (!state.riders.some((r) => r.id === rid)) {
        setBanner({ tone: "bad", title: "Unknown rider on this cash code" });
        return;
      }
      setCashFor(rid);
      return;
    }
    const norm = raw.toUpperCase().replace(/^#/, "");
    const p = state.parcels.find((x) => x.trk.toUpperCase() === norm || x.id.replace("#", "").toUpperCase() === norm);
    if (!p) {
      setBanner({ tone: "bad", title: `No parcel found for ${raw}`, sub: "Only confirmed Islamabad and Rawalpindi orders come into the app." });
      return;
    }
    if (p.status === "new") return setPrinting([p]);
    if (p.status === "labeled") return addToTray(p);
    if (p.status === "returned") {
      const r = receiveReturn(p.trk);
      setBanner({ tone: r.ok ? "good" : "bad", title: r.message, sub: p.flags.length ? `Flagged return. Check the box condition. ${p.flags.join(" · ")}` : `${p.customer} · returned by ${state.riders.find((x) => x.id === p.riderId)?.name ?? "rider"}` });
      return;
    }
    const who = state.riders.find((x) => x.id === p.riderId)?.name;
    setBanner({ tone: "bad", title: `${p.trk} can't be used here`, sub: `Status: ${p.status}${who ? ` · with ${who}` : ""}` });
  }

  async function syncShopify(ids: string[]) {
    if (ids.length === 0) return;
    const r = await fulfillInShopify(ids);
    if (r.ok) toast(`Shopify: ${ids.length} order${ids.length > 1 ? "s" : ""} marked fulfilled.`, "good");
    else toast(r.message ?? "Shopify could not be updated.", "bad");
  }

  function confirmHandover() {
    if (!rider || tray.length === 0) return;
    const ids = handover(rider.id, tray);
    toast(`${ids.length} parcel${ids.length > 1 ? "s" : ""} handed to ${rider.name}. Updating Shopify…`, "good");
    setTray([]);
    setBanner(null);
    input.current?.focus();
    void syncShopify(ids);
  }

  function markPrinted(list: Parcel[]) {
    const ids = list.filter((p) => p.status === "new").map((p) => p.id);
    if (ids.length === 1) printLabel(ids[0]);
    else if (ids.length > 1) printLabels(ids);
    toast(ids.length ? `${ids.length} label${ids.length > 1 ? "s" : ""} marked printed. Ready to hand over.` : "Done.", "good");
    setPrinting(null);
    input.current?.focus();
  }

  const riderMeta = (id: string) => {
    const live = state.parcels.filter((p) => p.riderId === id && p.status === "out").length;
    const handed = state.parcels.filter((p) => p.riderId === id && p.status === "handed").length;
    const back = state.parcels.filter((p) => p.riderId === id && p.status === "returned").length;
    const bits = [`${live} live`];
    if (handed) bits.push(`${handed} not scanned`);
    if (back) bits.push(`${back} return${back > 1 ? "s" : ""} to check in`);
    return bits.join(" · ");
  };

  const ageColor = (t: number) => {
    const m = (Date.now() - t) / 60000;
    return m > 60 ? "var(--red)" : m > 30 ? "var(--amber)" : "var(--muted)";
  };

  return (
    <div className="wh">
      <nav aria-label="Desk" className="wh-nav">
        <Link href="/" aria-label="Home" className="logo">
          <Icon name="box" size={22} stroke={2.2} />
        </Link>
        <span className="nav-item active"><Icon name="scan" size={22} />Dispatch</span>
        {me?.role === "admin" && (
          <Link href="/admin"><Icon name="grid" size={22} />Admin</Link>
        )}
        <button type="button" className="signout" onClick={() => signOut()}>
          <Icon name="logout" size={22} />Sign out
        </button>
      </nav>

      <main className="wh-main">
        <div className="row between wrap" style={{ gap: 12 }}>
          <div>
            <div className="small muted">Signed in as {me?.name || me?.email}</div>
            <h1>Dispatch desk</h1>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="row xs muted" style={{ gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />Confirmed Shopify orders arrive here by themselves
            </span>
            <button type="button" className="btn sm" onClick={() => { addTestOrder(); toast("Test order added."); }}>Add test order</button>
          </div>
        </div>

        <div className="row wrap" style={{ gap: 10 }}>
          <form onSubmit={onScan} className="row grow" style={{ gap: 10, minWidth: 260, background: "#fff", border: "2px solid var(--navy)", borderRadius: 14, padding: "4px 4px 4px 14px", boxShadow: "0 0 0 4px var(--navy-soft)" }}>
            <Icon name="scan" size={24} color="var(--navy)" />
            <label htmlFor="wh-scan" className="sr-only">Scan a box QR or type an order number</label>
            <input ref={input} id="wh-scan" autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan a box QR or type an order number" style={{ flex: 1, minWidth: 0, fontSize: 16, border: 0, outline: "none", background: "transparent", minHeight: 46 }} />
            <button type="submit" className="btn navy">Enter</button>
          </form>
          <div className="row" style={{ gap: 8, background: "#fff", border: "1px solid var(--line-2)", borderRadius: 12, padding: "0 12px", minHeight: 50, flex: "1 1 220px", maxWidth: 340 }}>
            <Icon name="search" size={18} color="var(--muted)" />
            <label htmlFor="wh-q" className="sr-only">Filter lists</label>
            <input id="wh-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, area, order" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent" }} />
          </div>
        </div>

        {banner && (
          <div role="status" className="row" style={{ gap: 12, background: banner.tone === "good" ? "var(--green)" : "var(--red)", color: "#fff", borderRadius: 12, padding: "10px 14px", flex: "none" }}>
            <Icon name={banner.tone === "good" ? "check" : "alert"} size={22} stroke={2.8} />
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{banner.title}</div>
              {banner.sub && <div className="small" style={{ opacity: 0.85 }}>{banner.sub}</div>}
            </div>
            {banner.undo && (
              <button type="button" className="btn sm" onClick={banner.undo} style={{ background: "rgba(255,255,255,.18)", color: "#fff", border: 0 }}>
                <Icon name="undo" size={16} /> Undo
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="icon-btn" style={{ width: 32, height: 32, background: "transparent", color: "#fff" }} onClick={() => setBanner(null)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        )}

        {shopifyErrors.length > 0 && (
          <div className="row wrap" style={{ gap: 10, background: "var(--amber-soft)", color: "var(--amber-ink)", borderRadius: 12, padding: "10px 14px", flex: "none" }}>
            <Icon name="info" />
            <span className="grow small"><b>{shopifyErrors.length}</b> handed-over order{shopifyErrors.length > 1 ? "s are" : " is"} not marked fulfilled in Shopify yet.</span>
            <button type="button" className="btn sm" onClick={() => void syncShopify(shopifyErrors.map((p) => p.id))}>Retry Shopify</button>
          </div>
        )}

        <div className="wh-cols">
          <section className="wh-col" aria-labelledby="col-print">
            <div className="wh-col-head">
              <h2 id="col-print" style={{ fontSize: 14, color: "var(--ink)" }}>Print label <Count n={toLabel.length} /></h2>
              {toLabelShown.length > 0 && (
                <button type="button" className="btn navy sm" onClick={() => setPrinting(toLabelShown.slice(0, BATCH))}>
                  <Icon name="printer" size={16} /> Print {Math.min(BATCH, toLabelShown.length)} label{toLabelShown.length > 1 ? "s" : ""}
                </button>
              )}
            </div>
            <div className="wh-list">
              {toLabelShown.length === 0 && <div className="small muted" style={{ padding: 6 }}>{toLabel.length ? "No orders match the filter." : "All orders have labels."}</div>}
              {toLabelShown.map((p) => (
                <div key={p.id} className="wh-row">
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <b style={{ fontSize: 13 }}>{p.id}</b>
                    <span className="small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.customer}</span>
                  </div>
                  <button type="button" className="act icon-btn" aria-label={`Print label for ${p.id}`} onClick={() => setPrinting([p])} style={{ background: "var(--navy-soft)", color: "var(--navy)" }}>
                    <Icon name="printer" size={18} />
                  </button>
                  <div className="sub">{p.area} · <span style={{ color: ageColor(p.createdAt) }}>{ago(p.createdAt)}</span> · {pkr(p.cod)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="wh-col" aria-labelledby="col-ready">
            <div className="wh-col-head">
              <h2 id="col-ready" style={{ fontSize: 14, color: "var(--ink)" }}>Ready to hand over <Count n={ready4.length} /></h2>
            </div>
            <div className="wh-list">
              {ready4.length === 0 && <div className="small muted" style={{ padding: 6 }}>Nothing waiting.</div>}
              {ready4.map((p) => (
                <div key={p.id} className="wh-row">
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>{p.trk}</span>
                    <span className="small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.customer}</span>
                  </div>
                  <button type="button" className="act btn sm" onClick={() => addToTray(p)}>Add</button>
                  <div className="sub">{p.area} · {pkr(p.cod)}</div>
                </div>
              ))}
            </div>
            <div className="xs muted" style={{ padding: "0 4px" }}>Scan a box (or press Add) to put it in the handover.</div>
          </section>

          <section className="wh-col bad" aria-labelledby="col-ret">
            <div className="wh-col-head">
              <h2 id="col-ret" style={{ fontSize: 14, color: "var(--red)" }}>Returns coming back <Count n={returning.length} bad /></h2>
            </div>
            <div className="wh-list">
              {returning.length === 0 && <div className="small muted" style={{ padding: 6 }}>No returns on the way.</div>}
              {returning.map((p) => (
                <div key={p.id} className="wh-row">
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>{p.trk}</span>
                    {p.flags.length > 0 && <span className="flag">Flagged</span>}
                  </div>
                  <button type="button" className="act btn sm" onClick={() => { const r = receiveReturn(p.trk); toast(r.message, r.ok ? "good" : "bad"); }}>Check in</button>
                  <div className="sub">{state.riders.find((r) => r.id === p.riderId)?.name} · {p.attempt?.reason}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <aside className="wh-side" aria-labelledby="ho-title">
        <h2 id="ho-title">Handover</h2>
        <div className="xs muted">Pick the rider, scan each box, then confirm. The Shopify order is marked fulfilled at handover.</div>
        <div className="wh-riders">
          {state.riders.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={riderId === r.id}
              onClick={() => { setRiderId(r.id); setTray([]); setBanner(null); input.current?.focus(); }}
              className="row"
              style={{ gap: 10, textAlign: "left", border: riderId === r.id ? "2px solid var(--navy)" : "1px solid var(--line)", background: riderId === r.id ? "var(--navy-soft)" : "#fff", borderRadius: 12, padding: "6px 10px", minHeight: 48, cursor: "pointer", flex: "none" }}
            >
              <span className="avatar">{initials(r.name)}</span>
              <span className="grow">
                <span style={{ display: "block", fontWeight: 600, fontSize: 13.5 }}>{r.name}</span>
                <span className="xs muted" style={{ display: "block" }}>{riderMeta(r.id)}</span>
              </span>
            </button>
          ))}
          {state.riders.length === 0 && <div className="xs muted">No riders yet. The admin adds them on the Staff page.</div>}
        </div>
        <div className="row between small" style={{ borderTop: "1px solid #eef1f5", paddingTop: 10, flex: "none" }}>
          <b>In this handover</b>
          <span className="muted num">{tray.length} box{tray.length === 1 ? "" : "es"} · {pkr(trayTotal)}</span>
        </div>
        <div className="wh-tray">
          {trayParcels.length === 0 && <div className="xs muted">Nothing scanned yet.</div>}
          {trayParcels.map((p) => (
            <div key={p.trk} className="row between tile" style={{ flex: "none", padding: "6px 10px" }}>
              <span style={{ minWidth: 0 }}>
                <span className="mono" style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>{p.trk}</span>
                <span className="xs muted" style={{ display: "block" }}>{p.area}</span>
              </span>
              <span className="row" style={{ gap: 6 }}>
                <b className="small num">{pkr(p.cod)}</b>
                <button type="button" aria-label={`Remove ${p.trk}`} className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setTray((t) => t.filter((x) => x !== p.trk))}>
                  <Icon name="x" size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
        <button type="button" className="btn red xl" disabled={!rider || tray.length === 0} onClick={confirmHandover} style={{ flex: "none" }}>
          {rider ? `Confirm handover to ${rider.name.split(" ")[0]} (${tray.length})` : "Pick a rider"}
        </button>
        {rider && (
          <button type="button" className="btn" onClick={() => setCashFor(rider.id)} style={{ flex: "none" }}>
            <Icon name="cash" size={18} /> Receive cash · {pkr(cashInHand(state, rider.id).inHand)}
          </button>
        )}
      </aside>

      {printing && (
        <>
          <PrintLabels parcels={printing} />
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPrinting(null)}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lbl-title" style={{ width: "min(520px, 100%)" }}>
              <h2 id="lbl-title">{printing.length === 1 ? `Shipping label · ${printing[0].id}` : `${printing.length} shipping labels`}</h2>
              <div className="scroll-box" style={{ maxHeight: "50vh", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", background: "var(--ground)", borderRadius: 10, padding: 10 }}>
                {printing.map((p) => <LabelSheet key={p.id} p={p} />)}
              </div>
              <div className="xs muted">One label per page on a 4 × 6 thermal printer. Paste each on its box.</div>
              <div className="row wrap" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setPrinting(null)}>Close</button>
                <button type="button" className="btn" onClick={() => window.print()}><Icon name="printer" size={16} /> Print</button>
                {printing.some((p) => p.status === "new") && (
                  <button type="button" className="btn navy" onClick={() => markPrinted(printing)}>
                    {printing.length === 1 ? "Label printed and pasted" : `Mark ${printing.length} as printed`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {cashFor && (() => {
        const r = state.riders.find((x) => x.id === cashFor);
        const amount = cashInHand(state, cashFor).inHand;
        return (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setCashFor(null)}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cash-title">
              <h2 id="cash-title">Cash deposit · {r?.name}</h2>
              <div className="small muted">Count the cash from the rider. The app expects:</div>
              <div className="num" style={{ fontSize: 30, fontWeight: 700 }}>{pkr(amount)}</div>
              <div className="xs muted">COD from today&apos;s deliveries minus what the rider already deposited today.</div>
              <div className="row wrap" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setCashFor(null)}>Cancel</button>
                <button
                  type="button"
                  className="btn green"
                  disabled={amount <= 0}
                  onClick={() => { deposit(cashFor, amount); toast(`${pkr(amount)} received from ${r?.name}.`, "good"); setCashFor(null); input.current?.focus(); }}
                >
                  Cash counted, record {pkr(amount)}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Count({ n, bad }: { n: number; bad?: boolean }) {
  return (
    <span className="xs" style={{ marginLeft: 6, fontWeight: 600, background: "#fff", color: bad ? "var(--red)" : "var(--ink)", borderRadius: 99, padding: "2px 9px", verticalAlign: "middle" }}>
      {n}
    </span>
  );
}
