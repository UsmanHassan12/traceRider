"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { initials, time } from "@/lib/format";
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
  if (!rider) return null;

  const mine = stats(state.parcels.filter((p) => p.riderId === rider.id));
  const team = stats(state.parcels.filter((p) => p.riderId));
  const holding = state.parcels.filter((p) => p.riderId === rider.id && (p.status === "out" || p.status === "handed")).length;
  const cash = cashInHand(state, rider.id).inHand;
  const shiftStart = state.parcels
    .filter((p) => p.riderId === rider.id && p.rideStartedAt)
    .reduce((m, p) => Math.min(m, p.rideStartedAt!), Date.now());

  function endShift() {
    if (holding > 0 || cash > 0) {
      toast(`You still hold ${holding} parcel${holding === 1 ? "" : "s"} and ${cash > 0 ? "cash" : "no cash"}. Return them to the warehouse first.`, "bad");
      return;
    }
    void signOut().then(() => router.replace("/login"));
  }

  const rows: [string, string][] = [
    ["Mobile", rider.phone || "Not set"],
    ["Bike", rider.bike || "Not set"],
    ["Driving licence", rider.licence || "Not set"],
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

        <button type="button" className="btn danger-outline xl" onClick={endShift}>
          <Icon name="logout" size={18} /> End shift and sign out
        </button>
        <div className="xs muted" style={{ textAlign: "center", marginTop: -6 }}>You can&apos;t end a shift while you hold parcels or cash.</div>
        <div className="xs muted" style={{ textAlign: "center" }}>Signed in as {me?.email}</div>
      </div>
    </>
  );
}
