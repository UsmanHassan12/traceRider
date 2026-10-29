"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { initials, time } from "@/lib/format";
import { DEMO } from "@/lib/rules";
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
  const { state, rider, logout } = useRider();
  const router = useRouter();
  const toast = useToast();
  const [lang, setLang] = useState<"en" | "ur">("en");
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
    logout();
    router.replace("/rider/login");
  }

  const rows: [string, string][] = [
    ["Mobile", `+92 ${rider.phone.slice(0, 3)} ${rider.phone.slice(3)}`],
    ["Bike", rider.bike],
    ["Driving licence", rider.licence],
    ["Warehouse", "I-9 · Desk 2"],
  ];

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

        <section className="card" style={{ borderRadius: 14, padding: "4px 14px" }}>
          <div className="row between" style={{ minHeight: 48, borderBottom: "1px solid #eef1f5" }}>
            <span>Language</span>
            <span className="row" style={{ gap: 4 }}>
              <button type="button" className="chip" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
              <button type="button" className="chip" aria-pressed={lang === "ur"} onClick={() => setLang("ur")} lang="ur">اردو</button>
            </span>
          </div>
          <a href="tel:" className="row between" style={{ minHeight: 48, borderBottom: "1px solid #eef1f5", color: "var(--ink)", textDecoration: "none" }}>
            <span>Call warehouse desk</span>
            <span className="small muted">[DESK NUMBER]</span>
          </a>
          <button type="button" onClick={() => toast("Problem reported to the warehouse.")} className="row between" style={{ minHeight: 48, width: "100%", border: 0, background: "none", padding: 0, cursor: "pointer" }}>
            <span>Report a problem</span>
            <Icon name="chevron" size={18} color="var(--muted)" />
          </button>
        </section>

        <button type="button" className="btn danger-outline xl" onClick={endShift}>
          <Icon name="logout" size={18} /> End shift and sign out
        </button>
        <div className="xs muted" style={{ textAlign: "center", marginTop: -6 }}>You can&apos;t end a shift while you hold parcels or cash.</div>
        {DEMO && (
          <button type="button" className="btn ghost sm" onClick={() => { logout(); router.replace("/rider/login"); }}>
            Demo: sign in as another rider
          </button>
        )}
      </div>
    </>
  );
}
