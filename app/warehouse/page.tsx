"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { LabelSheet } from "@/components/LabelSheet";
import { useToast } from "@/components/Toast";
import { ago, initials, pkr, time } from "@/lib/format";
import { cashInHand, useStore } from "@/lib/store";
import type { Parcel } from "@/lib/types";

type Banner = { tone: "good" | "bad"; title: string; sub?: string; undo?: () => void } | null;

export default function WarehouseDesk() {
  const { ready, state, me, addTestOrder, printLabel, handover, receiveReturn, deposit, signOut } = useStore();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [riderId, setRiderId] = useState<string | null>(null);
  const [tray, setTray] = useState<string[]>([]);
  const [banner, setBanner] = useState<Banner>(null);
  const [labelFor, setLabelFor] = useState<Parcel | null>(null);
  const [cashFor, setCashFor] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ready && !riderId && state.riders[0]) setRiderId(state.riders[0].id);
  }, [ready, riderId, state.riders]);

  if (!ready) return <div aria-busy="true" />;

  const rider = state.riders.find((r) => r.id === riderId) ?? null;
  const toLabel = state.parcels.filter((p) => p.status === "new").sort((a, b) => a.createdAt - b.createdAt);
  const ready4 = state.parcels.filter((p) => p.status === "labeled" && !tray.includes(p.trk));
  const returning = state.parcels.filter((p) => p.status === "returned").sort((a, b) => (a.attempt?.at ?? 0) - (b.attempt?.at ?? 0));
  const trayParcels = tray.map((t) => state.parcels.find((p) => p.trk === t)).filter((p): p is Parcel => !!p);
  const trayTotal = trayParcels.reduce((s, p) => s + p.cod, 0);

  function addToTray(p: Parcel) {
    if (!rider) {
      setBanner({ tone: "bad", title: "Pick the rider first", sub: "Choose who is taking the parcels on the right, then scan again." });
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
    const p = state.parcels.find((x) => x.trk.toUpperCase() === norm || x.id.replace("#", "") === norm);
    if (!p) {
      setBanner({ tone: "bad", title: `No parcel found for ${raw}`, sub: "Check the label or sync Shopify orders." });
      return;
    }
    if (p.status === "new") return setLabelFor(p);
    if (p.status === "labeled") return addToTray(p);
    if (p.status === "returned") {
      const r = receiveReturn(p.trk);
      setBanner({ tone: r.ok ? "good" : "bad", title: r.message, sub: p.flags.length ? `Flagged return. Check the box condition. ${p.flags.join(" · ")}` : `${p.customer} · returned by ${state.riders.find((x) => x.id === p.riderId)?.name ?? "rider"}` });
      return;
    }
    const who = state.riders.find((x) => x.id === p.riderId)?.name;
    setBanner({ tone: "bad", title: `${p.trk} can't be used here`, sub: `Status: ${p.status}${who ? ` · with ${who}` : ""}` });
  }

  function confirmHandover() {
    if (!rider || tray.length === 0) return;
    handover(rider.id, tray);
    toast(`${tray.length} parcel${tray.length > 1 ? "s" : ""} handed to ${rider.name}. They must scan each box to start.`, "good");
    setTray([]);
    setBanner(null);
    input.current?.focus();
  }

  const riderMeta = (id: string) => {
    const live = state.parcels.filter((p) => p.riderId === id && p.status === "out").length;
    const handed = state.parcels.filter((p) => p.riderId === id && p.status === "handed").length;
    const back = state.parcels.filter((p) => p.riderId === id && p.status === "returned").length;
    const bits = [`${live} live`];
    if (handed) bits.push(`${handed} not scanned`);
    if (back) bits.push(`${back} return${back > 1 ? "s" : ""} not checked in`);
    return bits.join(" · ");
  };

  const ageColor = (t: number) => {
    const m = (Date.now() - t) / 60000;
    return m > 60 ? "var(--red)" : m > 30 ? "var(--amber)" : "var(--muted)";
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexWrap: "wrap", background: "var(--ground)" }}>
      <nav aria-label="Desk" style={{ flex: "0 0 84px", background: "var(--red)", color: "#f7d9d9", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "18px 0", fontSize: 11 }}>
        <Link href="/" aria-label="Home" style={{ width: 44, height: 44, borderRadius: 11, background: "#fff", color: "var(--red)", display: "grid", placeItems: "center", marginBottom: 14 }}>
          <Icon name="box" size={22} stroke={2.2} />
        </Link>
        <span style={{ width: 68, minHeight: 60, borderRadius: 12, background: "rgba(0,0,0,.22)", color: "#fff", fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Icon name="scan" size={22} />Dispatch
        </span>
        {me?.role === "admin" && (
          <Link href="/admin" style={{ width: 68, minHeight: 60, borderRadius: 12, color: "#f7d9d9", textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Icon name="grid" size={22} />Admin
          </Link>
        )}
        <button type="button" onClick={() => signOut()} style={{ marginTop: "auto", width: 68, minHeight: 60, borderRadius: 12, border: 0, background: "transparent", color: "#f7d9d9", fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}>
          <Icon name="logout" size={22} />Sign out
        </button>
      </nav>

      <main style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16, padding: "18px 22px" }}>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div>
            <div className="small muted">Signed in as {me?.name || me?.email}</div>
            <h1>Dispatch desk</h1>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="row xs muted" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />New Shopify orders appear here by themselves</span>
            <button type="button" className="btn sm" onClick={() => { addTestOrder(); toast("Test order added."); }}>
              Add test order
            </button>
          </div>
        </div>

        <form onSubmit={onScan} className="row" style={{ gap: 12, background: "#fff", border: "2px solid var(--navy)", borderRadius: 14, padding: "6px 6px 6px 16px", boxShadow: "0 0 0 4px var(--navy-soft)" }}>
          <Icon name="scan" size={26} color="var(--navy)" />
          <label htmlFor="wh-scan" className="sr-only">Scan a box QR or type an order number</label>
          <input ref={input} id="wh-scan" autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan a box QR or type an order number" style={{ flex: 1, minWidth: 0, fontSize: 17, border: 0, outline: "none", background: "transparent", minHeight: 52 }} />
          <button type="submit" className="btn navy">Enter</button>
        </form>

        {banner && (
          <div role="status" className="row" style={{ gap: 14, background: banner.tone === "good" ? "var(--green)" : "var(--red)", color: "#fff", borderRadius: 14, padding: "14px 16px" }}>
            <span style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.2)", display: "grid", placeItems: "center" }}>
              <Icon name={banner.tone === "good" ? "check" : "alert"} size={22} stroke={2.8} />
            </span>
            <div className="grow">
              <div style={{ fontWeight: 600, fontSize: 16 }}>{banner.title}</div>
              {banner.sub && <div className="small" style={{ opacity: 0.85 }}>{banner.sub}</div>}
            </div>
            {banner.undo && (
              <button type="button" className="btn" onClick={banner.undo} style={{ background: "rgba(255,255,255,.18)", color: "#fff", border: 0 }}>
                <Icon name="undo" size={16} /> Undo
              </button>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, alignItems: "start" }}>
          <Column title="Print label" count={toLabel.length}>
            {toLabel.length === 0 && <div className="small muted" style={{ padding: 6 }}>All orders have labels.</div>}
            {toLabel.map((p) => (
              <div key={p.id} className="card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, border: 0 }}>
                <div className="row between"><b style={{ fontSize: 13 }}>{p.id}</b><span className="xs" style={{ color: ageColor(p.createdAt), fontWeight: 500 }}>{ago(p.createdAt)}</span></div>
                <div className="small">{p.customer} · <span className="muted">{p.area}</span></div>
                <button type="button" className="btn navy sm" onClick={() => setLabelFor(p)}><Icon name="printer" size={16} /> Print label</button>
              </div>
            ))}
          </Column>

          <Column title="Ready to hand over" count={ready4.length}>
            {ready4.map((p) => (
              <div key={p.id} className="card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, border: 0 }}>
                <div className="row between"><span className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>{p.trk}</span><b className="xs num">{pkr(p.cod)}</b></div>
                <div className="small">{p.customer} · <span className="muted">{p.area}</span></div>
                <button type="button" className="btn sm" onClick={() => addToTray(p)}>Add to handover</button>
              </div>
            ))}
            <div className="xs muted" style={{ padding: "0 4px" }}>Scan a box to add it to the handover on the right.</div>
          </Column>

          <Column title="Returns coming back" count={returning.length} tone="bad">
            {returning.length === 0 && <div className="small muted" style={{ padding: 6 }}>No returns on the way.</div>}
            {returning.map((p) => (
              <div key={p.id} className="card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, border: 0 }}>
                <div className="row between"><span className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>{p.trk}</span><span className="xs muted">{state.riders.find((r) => r.id === p.riderId)?.name}</span></div>
                <div className="small muted">{p.attempt?.reason}</div>
                {p.flags.length > 0 && <span className="flag" style={{ alignSelf: "flex-start" }}>Flagged · check box condition</span>}
                <button type="button" className="btn sm" onClick={() => { const r = receiveReturn(p.trk); toast(r.message, r.ok ? "good" : "bad"); }}>Check in</button>
              </div>
            ))}
          </Column>
        </div>
      </main>

      <aside style={{ flex: "1 1 320px", maxWidth: 420, background: "#fff", borderLeft: "1px solid var(--line)", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <h2>Handover</h2>
        <div className="small muted">Pick the rider, scan each box, then confirm. The rider must scan every box again before the ride starts.</div>
        <div className="stack" style={{ gap: 8 }}>
          {state.riders.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={riderId === r.id}
              onClick={() => { setRiderId(r.id); setTray([]); setBanner(null); input.current?.focus(); }}
              className="row"
              style={{ gap: 10, textAlign: "left", border: riderId === r.id ? "2px solid var(--navy)" : "1px solid var(--line)", background: riderId === r.id ? "var(--navy-soft)" : "#fff", borderRadius: 12, padding: "8px 12px", minHeight: 52, cursor: "pointer" }}
            >
              <span className="avatar">{initials(r.name)}</span>
              <span className="grow">
                <span style={{ display: "block", fontWeight: 600, fontSize: 13.5 }}>{r.name}</span>
                <span className="xs muted" style={{ display: "block" }}>{riderMeta(r.id)}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="stack" style={{ gap: 8, borderTop: "1px solid #eef1f5", paddingTop: 12 }}>
          <div className="row between small"><b>In this handover</b><span className="muted num">{tray.length} box{tray.length === 1 ? "" : "es"} · {pkr(trayTotal)}</span></div>
          {trayParcels.length === 0 && <div className="xs muted">Nothing scanned yet.</div>}
          {trayParcels.map((p) => (
            <div key={p.trk} className="row between tile">
              <span>
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
        <button type="button" className="btn red xl" disabled={!rider || tray.length === 0} onClick={confirmHandover} style={{ marginTop: "auto" }}>
          {rider ? `Confirm handover to ${rider.name.split(" ")[0]} (${tray.length})` : "Pick a rider"}
        </button>
        {rider && (
          <button type="button" className="btn" onClick={() => setCashFor(rider.id)}>
            <Icon name="cash" size={18} /> Receive cash from {rider.name.split(" ")[0]} · {pkr(cashInHand(state, rider.id).inHand)}
          </button>
        )}
        {state.riders.length === 0 && <div className="xs muted">No riders yet. The admin adds them on the Staff page.</div>}
      </aside>

      {labelFor && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setLabelFor(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lbl-title">
            <h2 id="lbl-title">Shipping label · {labelFor.id}</h2>
            <div className="print-area"><LabelSheet p={labelFor} /></div>
            <div className="xs muted">Print on a 4 × 6 thermal label and paste it on the box. The rider scans this QR to take the parcel.</div>
            <div className="row wrap" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => window.print()}><Icon name="printer" size={16} /> Print</button>
              {labelFor.status === "new" ? (
                <button type="button" className="btn navy" onClick={() => { printLabel(labelFor.id); toast(`Label for ${labelFor.id} done. It's ready to hand over.`, "good"); setLabelFor(null); input.current?.focus(); }}>
                  Label printed and pasted
                </button>
              ) : (
                <button type="button" className="btn navy" onClick={() => setLabelFor(null)}>Close</button>
              )}
            </div>
          </div>
        </div>
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
              <div className="row" style={{ justifyContent: "flex-end" }}>
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

function Column({ title, count, tone, children }: { title: string; count: number; tone?: "bad"; children: React.ReactNode }) {
  return (
    <section style={{ background: tone === "bad" ? "#fbedec" : "#ebeff4", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row between" style={{ padding: "2px 4px" }}>
        <h2 style={{ fontSize: 14, color: tone === "bad" ? "var(--red)" : "var(--ink)" }}>{title}</h2>
        <span className="xs" style={{ fontWeight: 600, background: "#fff", color: tone === "bad" ? "var(--red)" : "var(--ink)", borderRadius: 99, padding: "2px 9px" }}>{count}</span>
      </div>
      {children}
    </section>
  );
}
