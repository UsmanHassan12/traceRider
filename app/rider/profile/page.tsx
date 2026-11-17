"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { isReady } from "@/lib/custody";
import { initials, isToday, pkr, time } from "@/lib/format";
import { cashInHand } from "@/lib/store";
import type { Parcel } from "@/lib/types";
import { useRider } from "@/lib/useRider";

const WEEK = 7 * 24 * 3600e3;

function stats(list: Parcel[]) {
  const closed = list.filter((p) => p.attempt && Date.now() - p.attempt.at < WEEK);
  const ret = closed.filter((p) => p.attempt!.outcome === "returned");
  const del = closed.length - ret.length;
  const calls = ret.length ? ret.reduce((s, p) => s + p.attempt!.calls, 0) / ret.length : 0;
  return {
    closed: closed.length,
    delivered: closed.length ? Math.round((del / closed.length) * 100) : 0,
    returnRate: closed.length ? Math.round((ret.length / closed.length) * 100) : 0,
    flagged: ret.filter((p) => p.flags.length).length,
    calls: calls.toFixed(1),
  };
}

export default function ProfilePage() {
  const { state, rider, signOut, me } = useRider();
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<"end" | "signout" | null>(null);
  const [busy, setBusy] = useState(false);
  if (!rider) return null;

  const mine = stats(state.parcels.filter((p) => p.riderId === rider.id));
  const team = stats(state.parcels.filter((p) => p.riderId));
  const own = state.parcels.filter((p) => p.riderId === rider.id);
  // what still ties the rider to today's work
  const onTheWay = own.filter((p) => p.status === "out").length;
  const pickedUp = own.filter(isReady).length;
  const returnsWithHim = own.filter((p) => p.status === "returned").length;
  const cash = cashInHand(state, rider.id).inHand;
  const toConfirm = state.deposits.filter((d) => d.riderId === rider.id && d.status === "pending").length;
  const blockers: { text: string; href: string; action: string }[] = [];
  if (onTheWay) blockers.push({ text: `${onTheWay} parcel${onTheWay > 1 ? "s" : ""} still out for delivery`, href: "/rider/live", action: "Live rides" });
  if (pickedUp) blockers.push({ text: `${pickedUp} picked-up parcel${pickedUp > 1 ? "s" : ""} not delivered. Deliver or give back to the desk`, href: "/rider", action: "My parcels" });
  if (returnsWithHim) blockers.push({ text: `${returnsWithHim} returned parcel${returnsWithHim > 1 ? "s" : ""} not checked in at the warehouse yet`, href: "/rider", action: "My parcels" });
  if (cash > 0) blockers.push({ text: `${pkr(cash)} cash in hand. Hand it in at the warehouse`, href: "/rider/cash", action: "Hand in cash" });
  if (toConfirm) blockers.push({ text: `${toConfirm} cash handover waiting for you to accept or dispute`, href: "/rider/cash", action: "Cash" });
  const closedToday = own.filter((p) => p.attempt && isToday(p.attempt.at));
  const deliveredToday = closedToday.filter((p) => p.attempt!.outcome === "delivered").length;
  const handedToday = state.deposits.filter((d) => d.riderId === rider.id && isToday(d.at)).reduce((s, d) => s + d.amount, 0);
  const shiftStart = state.parcels
    .filter((p) => p.riderId === rider.id && p.rideStartedAt)
    .reduce((m, p) => Math.min(m, p.rideStartedAt!), Date.now());

  async function leave(endingShift: boolean) {
    setBusy(true);
    if (endingShift) {
      try {
        localStorage.setItem(`rider-trace.shift-ended.${rider!.id}`, String(Date.now()));
      } catch {
        /* not essential */
      }
    }
    await signOut();
    toast(endingShift ? "Shift ended. Khuda hafiz!" : "Signed out. Your shift continues when you sign back in.", "good");
    router.replace("/login");
  }

  const rows: [string, string][] = [
    ["Mobile", rider.phone || "Not set"],
    ["Bike", rider.bike || "Not set"],
    ["Driving licence no.", rider.licence || "Not set"],
    ["Licence expires", rider.licenceExpiry ? `${new Date(`${rider.licenceExpiry}T12:00:00`).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}${new Date(`${rider.licenceExpiry}T23:59:59`).getTime() < Date.now() ? " · expired" : ""}` : "Not set"],
  ];
  const deskPhone = process.env.NEXT_PUBLIC_DESK_PHONE ?? "";

  return (
    <>
      <div className="topbar" style={{ padding: "22px 18px 18px", gap: 14 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--red)", color: "#fff", fontWeight: 700, fontSize: 22, display: "grid", placeItems: "center", flex: "none" }}>{initials(rider.name)}</div>
        <div className="grow">
          <div style={{ fontWeight: 700, fontSize: 19 }}>{rider.name}</div>
          <div className="small muted mono">Rider ID {rider.id}</div>
          <div className="xs" style={{ color: "var(--green)", fontWeight: 600, marginTop: 2 }}>On shift since {time(shiftStart)}</div>
        </div>
      </div>

      <div className="phone-main">
        <section className="card" style={{ borderRadius: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row between" style={{ alignItems: "baseline" }}>
            <h2 style={{ fontSize: 14 }}>Your last 7 days</h2>
            <span className="xs muted">Team after the dot</span>
          </div>
          <div className="grid2 num">
            <div className="tile"><div style={{ fontSize: 20, fontWeight: 700, color: "var(--green)" }}>{mine.delivered}%</div><div className="xs muted">Delivered · {team.delivered}%</div></div>
            <div className="tile"><div style={{ fontSize: 20, fontWeight: 700 }}>{mine.returnRate}%</div><div className="xs muted">Return rate · {team.returnRate}%</div></div>
            <div className="tile"><div style={{ fontSize: 20, fontWeight: 700, color: mine.flagged ? "var(--red)" : undefined }}>{mine.flagged}</div><div className="xs muted">Flagged returns</div></div>
            <div className="tile"><div style={{ fontSize: 20, fontWeight: 700 }}>{mine.calls}</div><div className="xs muted">Calls per return · {team.calls}</div></div>
          </div>
        </section>

        <section className="card" style={{ borderRadius: 14, padding: "4px 14px" }}>
          {rows.map(([k, v], i) => (
            <div key={k} className="row between" style={{ padding: "11px 0", borderBottom: i < rows.length - 1 ? "1px solid #eef1f5" : 0 }}>
              <span className="muted">{k}</span>
              <span style={{ fontWeight: 500, textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </section>

        {deskPhone && (
          <a href={`tel:${deskPhone.replace(/\s/g, "")}`} className="card row between" style={{ borderRadius: 14, minHeight: 52, color: "var(--ink)", textDecoration: "none" }}>
            <span className="row" style={{ gap: 10 }}><Icon name="phone" size={18} />Call warehouse desk</span>
            <span className="small muted">{deskPhone}</span>
          </a>
        )}

        <button type="button" className="btn red xl" onClick={() => setDialog("end")}>
          <Icon name="check" size={18} /> End shift
        </button>
        <div className="xs muted" style={{ textAlign: "center", marginTop: -6 }}>
          {blockers.length ? `${blockers.length} thing${blockers.length > 1 ? "s" : ""} to finish before you can end your shift.` : "Everything is handed back. You can end your shift."}
        </div>
        <button type="button" className="btn ghost" onClick={() => setDialog("signout")}>
          <Icon name="logout" size={18} /> Sign out
        </button>
        <div className="xs muted" style={{ textAlign: "center" }}>Signed in as {me?.email}</div>
      </div>

      {dialog === "end" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && !busy && setDialog(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="es-title">
            {blockers.length ? (
              <>
                <h2 id="es-title">You can&apos;t end your shift yet</h2>
                <div className="small muted">Finish these first:</div>
                <div className="stack" style={{ gap: 8 }}>
                  {blockers.map((b) => (
                    <div key={b.text} className="row between" style={{ gap: 10, background: "var(--red-tint)", border: "1px solid #f0c9c6", borderRadius: 12, padding: "10px 12px" }}>
                      <span className="small" style={{ fontWeight: 500 }}>{b.text}</span>
                      <Link href={b.href} className="btn sm" style={{ flex: "none" }} onClick={() => setDialog(null)}>{b.action}</Link>
                    </div>
                  ))}
                </div>
                <div className="xs muted">Need to leave anyway? Use Sign out. Your parcels and cash stay on your name until they are handed back.</div>
                <button type="button" className="btn" onClick={() => setDialog(null)}>OK</button>
              </>
            ) : (
              <>
                <h2 id="es-title">End your shift?</h2>
                <div className="grid2 num">
                  <div className="tile"><div className="xs muted">Delivered today</div><b style={{ fontSize: 18, color: "var(--green)" }}>{deliveredToday}</b></div>
                  <div className="tile"><div className="xs muted">Returned today</div><b style={{ fontSize: 18 }}>{closedToday.length - deliveredToday}</b></div>
                  <div className="tile"><div className="xs muted">Cash handed in today</div><b style={{ fontSize: 18 }}>{pkr(handedToday)}</b></div>
                  <div className="tile"><div className="xs muted">Cash in hand</div><b style={{ fontSize: 18 }}>{pkr(0)}</b></div>
                </div>
                <div className="small muted">No parcels or cash are left on your name.</div>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setDialog(null)} disabled={busy}>Cancel</button>
                  <button type="button" className="btn red" onClick={() => leave(true)} disabled={busy}>{busy ? "Ending…" : "End shift"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {dialog === "signout" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && !busy && setDialog(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="so-title">
            <h2 id="so-title">Sign out?</h2>
            <div className="small muted">
              This only logs you out of this phone. Your shift is not ended
              {blockers.length ? ": parcels and cash you hold stay on your name until they are handed back." : "."}
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn" onClick={() => setDialog(null)} disabled={busy}>Cancel</button>
              <button type="button" className="btn navy" onClick={() => leave(false)} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
