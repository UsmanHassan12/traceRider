"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Pager, usePaged } from "@/components/Pager";
import { StopBadge } from "@/components/StopBadge";
import { useToast } from "@/components/Toast";
import { isReady, isToPick } from "@/lib/custody";
import { ago, initials, isToday, pkr, time } from "@/lib/format";
import { routeLink } from "@/lib/route";
import { RULES } from "@/lib/rules";
import { cashInHand } from "@/lib/store";
import type { Parcel } from "@/lib/types";
import { useRider } from "@/lib/useRider";
import { useRoute } from "@/lib/useRoute";

type Filter = "all" | "ready" | "pick" | "out" | "closed";

/** Rider home: every parcel assigned to him today, in delivery order, with what to do next. */
export default function RiderHome() {
  const { state, rider, startRide } = useRider();
  const router = useRouter();
  const toast = useToast();
  const [onDuty, setOnDuty] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const mine = rider ? state.parcels.filter((p) => p.riderId === rider.id) : [];
  // delivery order covers parcels he has in hand: picked up and not started, or on the way
  const route = useRoute(mine.filter((p) => isReady(p) || p.status === "out"));
  if (!rider) return null;

  const stopOf = (p: Parcel) => route.stopOf.get(p.id)?.stop ?? null;
  const byStop = (a: Parcel, b: Parcel) => (stopOf(a) ?? 999) - (stopOf(b) ?? 999);
  const s = q.trim().toLowerCase();
  const hit = (p: Parcel) => !s || [p.customer, p.address, p.area, p.trk, p.id, p.phone].some((x) => x.toLowerCase().includes(s));

  const ready = mine.filter(isReady).sort(byStop);
  const toPick = mine.filter(isToPick);
  const out = mine.filter((p) => p.status === "out").sort(byStop);
  const closed = mine.filter((p) => p.attempt && isToday(p.attempt.at)).sort((a, b) => b.attempt!.at - a.attempt!.at);
  const delivered = closed.filter((p) => p.attempt!.outcome === "delivered").length;
  const returned = closed.length - delivered;
  const assigned = ready.length + toPick.length;
  const cash = cashInHand(state, rider.id);
  const pct = Math.min(100, Math.round((cash.inHand / RULES.cashLimit) * 100));
  const mapLink = routeLink(route.stops);

  const groups: { key: Filter; title: string; items: Parcel[]; hint?: string }[] = [
    { key: "ready", title: route.hasBase ? "Ready to deliver · nearest first" : "Ready to deliver", items: ready.filter(hit), hint: "Tap Start delivery when you set off for that customer." },
    { key: "out", title: "On the way", items: out.filter(hit) },
    { key: "pick", title: "To pick up · scan at the warehouse", items: toPick.filter(hit) },
    { key: "closed", title: "Closed today", items: closed.filter(hit) },
  ];
  const shown = groups.filter((g) => (filter === "all" || filter === g.key) && g.items.length);
  const chips: [Filter, string, number][] = [
    ["all", "All", ready.length + out.length + toPick.length + closed.length],
    ["ready", "Ready", ready.length],
    ["out", "On the way", out.length],
    ["pick", "To pick up", toPick.length],
    ["closed", "Closed", closed.length],
  ];

  function start(p: Parcel) {
    const r = startRide(p.trk, rider!.id, false);
    if (!r.ok) return toast(r.message, "bad");
    toast("Delivery started. GPS is on.", "good");
    router.push(`/rider/ride/${encodeURIComponent(p.trk)}`);
  }

  return (
    <>
      <div style={{ background: "var(--red)", color: "#fff", padding: "22px 18px 58px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row between">
          <div className="row" style={{ gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", color: "var(--red)", fontWeight: 700, display: "grid", placeItems: "center" }}>{initials(rider.name)}</div>
            <div>
              <div className="xs" style={{ color: "#f7d9d9" }}>Assalam o Alaikum</div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{rider.name}</div>
            </div>
          </div>
          <button
            type="button"
            aria-pressed={onDuty}
            onClick={() => setOnDuty(!onDuty)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,.22)", color: "#fff", border: 0, borderRadius: 99, padding: "6px 6px 6px 14px", minHeight: 44, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            {onDuty ? "On duty" : "Off duty"}
            <span style={{ width: 44, height: 26, borderRadius: 99, background: onDuty ? "#3fbf7f" : "rgba(255,255,255,.35)", position: "relative", display: "block" }}>
              <span style={{ position: "absolute", top: 3, left: onDuty ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </span>
          </button>
        </div>
        <div className="xs mono" style={{ color: "#f7d9d9" }}>{rider.bike.split("· ")[1] ?? rider.bike} · {rider.id}</div>
      </div>

      <div className="card" style={{ margin: "-44px 16px 0", borderRadius: 16, boxShadow: "0 6px 22px rgba(31,43,61,.10)", border: 0, display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div>
            <div className="xs muted">Cash in hand</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15 }}>{pkr(cash.inHand)}</div>
          </div>
          <div className="xs muted" style={{ textAlign: "right" }}>
            Deposit limit<br />
            <b style={{ color: "var(--ink)" }}>{pkr(RULES.cashLimit)}</b>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "#eef1f5", overflow: "hidden" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cash limit used">
          <div style={{ width: `${pct}%`, height: "100%", background: pct > 90 ? "var(--red)" : "var(--navy)", borderRadius: 4 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", borderTop: "1px solid #eef1f5", paddingTop: 12, textAlign: "center" }}>
          <div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>{ready.length}</div><div className="xs muted">Ready</div></div>
          <div style={{ borderLeft: "1px solid #eef1f5" }}><div style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)" }}>{out.length}</div><div className="xs muted">On the way</div></div>
          <div style={{ borderLeft: "1px solid #eef1f5" }}><div style={{ fontSize: 20, fontWeight: 700, color: "var(--green)" }}>{delivered}</div><div className="xs muted">Delivered</div></div>
          <div style={{ borderLeft: "1px solid #eef1f5" }}><div style={{ fontSize: 20, fontWeight: 700, color: "var(--amber)" }}>{returned}</div><div className="xs muted">Returned</div></div>
        </div>
      </div>

      <div className="phone-main">
        {toPick.length > 0 && (
          <Link href="/rider/scan" className="card" style={{ textDecoration: "none", color: "var(--amber-ink)", background: "var(--amber-soft)", border: "1px solid #f1d7ae", borderRadius: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="row between">
              <b>Pick up {toPick.length} parcel{toPick.length > 1 ? "s" : ""}</b>
              <span className="small num">{assigned - toPick.length} of {assigned} scanned</span>
            </div>
            <div className="small">The desk assigned these to you. Scan each box as you take it.</div>
            <span className="btn navy" style={{ minHeight: 52 }}><Icon name="scan" size={22} /> Scan parcels</span>
          </Link>
        )}

        <div className="row" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "0 12px", minHeight: 46 }}>
          <Icon name="search" size={18} color="var(--muted)" />
          <label htmlFor="rh-q" className="sr-only">Search parcels</label>
          <input id="rh-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, area or tracking ID" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", minHeight: 44 }} />
        </div>
        <div className="row" style={{ gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {chips.map(([k, l, n]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {n}</button>
          ))}
        </div>

        {mapLink && ready.length + out.length > 1 && (filter === "all" || filter === "ready" || filter === "out") && (
          <a href={mapLink} target="_blank" rel="noreferrer" className="btn" style={{ minHeight: 48 }}>
            <Icon name="map" size={18} /> Open full route in Google Maps
          </a>
        )}

        {shown.length === 0 && <div className="empty">{mine.length ? "No parcels match." : "No parcels yet. The warehouse assigns parcels to you, then you scan them at pickup."}</div>}
        {shown.map((g) => (
          <Group key={g.key} title={g.title} hint={g.hint} items={g.items} resetKey={`${filter}|${q}`} stopOf={stopOf} onStart={start} />
        ))}
      </div>
    </>
  );
}

function Group({ title, hint, items, resetKey, stopOf, onStart }: { title: string; hint?: string; items: Parcel[]; resetKey: string; stopOf: (p: Parcel) => number | null; onStart: (p: Parcel) => void }) {
  const pg = usePaged(items, 8, resetKey);
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div>
        <h2 className="xs" style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>{title} · {items.length}</h2>
        {hint && <div className="xs muted">{hint}</div>}
      </div>
      {pg.rows.map((p) => <ParcelCard key={p.id} p={p} stop={stopOf(p)} onStart={onStart} />)}
      <Pager {...pg} label={title} />
    </section>
  );
}

function ParcelCard({ p, stop, onStart }: { p: Parcel; stop: number | null; onStart: (p: Parcel) => void }) {
  const ready = isReady(p);
  const pick = isToPick(p);
  const pill = p.status === "out" ? (
    <span className="pill info">On the way · {ago(p.rideStartedAt ?? Date.now())}</span>
  ) : ready ? (
    <span className="pill good">Picked up</span>
  ) : pick ? (
    <span className="pill warn">Not scanned</span>
  ) : p.attempt?.outcome === "delivered" ? (
    <span className="pill good">Delivered {time(p.attempt.at)}</span>
  ) : (
    <span className="pill bad">Returned {p.attempt ? time(p.attempt.at) : ""}</span>
  );

  const body = (
    <>
      <div className="row between" style={{ alignItems: "flex-start", gap: 6 }}>
        {(ready || p.status === "out") && <StopBadge n={stop} />}
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{p.customer}</div>
          <div className="small muted">{p.address}</div>
        </div>
        {pill}
      </div>
      <div className="row between">
        <span className="mono xs muted">{p.trk}</span>
        <span className="num" style={{ fontWeight: 700 }}>{p.cod ? pkr(p.cod) : "Prepaid"}</span>
      </div>
      {p.attempt?.reason && <div className="xs" style={{ color: "var(--red)" }}>{p.attempt.reason}</div>}
    </>
  );
  const style = { textDecoration: "none", color: "var(--ink)", display: "flex", flexDirection: "column" as const, gap: 8, borderRadius: 14 };

  if (p.status === "out") return <Link href={`/rider/ride/${encodeURIComponent(p.trk)}`} className="card" style={style}>{body}</Link>;
  if (pick) return <Link href="/rider/scan" className="card" style={{ ...style, opacity: 0.8 }}>{body}</Link>;
  return (
    <div className="card" style={style}>
      {body}
      {ready && (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn red grow" onClick={() => onStart(p)}><Icon name="nav" size={18} /> Start delivery</button>
        </div>
      )}
    </div>
  );
}
