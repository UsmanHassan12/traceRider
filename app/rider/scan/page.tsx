"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { QrScanner } from "@/components/QrScanner";
import { useToast } from "@/components/Toast";
import { pkr, time } from "@/lib/format";
import type { Parcel } from "@/lib/types";
import { useRider } from "@/lib/useRider";

export default function ScanPage() {
  const { state, rider, startRide } = useRider();
  const router = useRouter();
  const toast = useToast();
  const [match, setMatch] = useState<{ p: Parcel; manual: boolean } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);

  if (!rider) return null;

  function check(code: string, manual: boolean) {
    const p = state.parcels.find((x) => x.trk.toUpperCase() === code.trim().toUpperCase());
    setMatch(null);
    setProblem(null);
    if (!p) return setProblem(`No parcel has code ${code}. Check the label.`);
    if (p.status === "new" || p.status === "labeled") return setProblem(`${p.trk} has not been handed to a rider yet. Ask the desk to hand it over first.`);
    if (p.riderId !== rider!.id) {
      const other = state.riders.find((r) => r.id === p.riderId)?.name ?? "another rider";
      return setProblem(`${p.trk} was handed to ${other}, not you. Ask the warehouse to reassign it.`);
    }
    if (p.status === "out") {
      router.push(`/rider/ride/${encodeURIComponent(p.trk)}`);
      return;
    }
    if (p.status !== "handed") return setProblem(`${p.trk} is already closed.`);
    setMatch({ p, manual });
  }

  function start() {
    if (!match) return;
    const r = startRide(match.p.trk, rider!.id, match.manual);
    if (!r.ok) {
      setProblem(r.message);
      setMatch(null);
      return;
    }
    toast("Ride started. GPS is on.", "good");
    router.replace(`/rider/ride/${encodeURIComponent(match.p.trk)}`);
  }

  const handedAt = match?.p.events.filter((e) => e.what.startsWith("Handed to")).pop();

  return (
    <div style={{ position: "fixed", inset: 0, maxWidth: 480, margin: "0 auto", background: "#0e1522", display: "flex", flexDirection: "column" }}>
      <div className="row between" style={{ position: "absolute", left: 16, right: 16, top: 16, zIndex: 3 }}>
        <Link href="/rider" className="icon-btn" aria-label="Close scanner" style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>
          <Icon name="x" stroke={2.2} />
        </Link>
        <div style={{ color: "#fff", fontWeight: 600 }}>Scan label QR</div>
        <span style={{ width: 44 }} />
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <QrScanner paused={!!match} onResult={(t) => check(t, false)} />
      </div>

      <div className="sheet" style={{ position: "relative", zIndex: 4 }}>
        <div className="grabber" />
        {match ? (
          <>
            <div className="row" style={{ gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--green-soft)", color: "var(--green)", display: "grid", placeItems: "center" }}>
                <Icon name="check" size={22} stroke={2.6} />
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>Parcel matched</div>
                <div className="small muted">{handedAt ? `Handed to you by ${handedAt.by} · ${time(handedAt.at)}` : "Handed to you"}</div>
              </div>
            </div>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="row between"><span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{match.p.trk}</span><span className="small muted">Order {match.p.id}</span></div>
              <div style={{ fontWeight: 600 }}>{match.p.customer}</div>
              <div className="small muted">{match.p.address}</div>
              <div className="row between" style={{ borderTop: "1px solid #eef1f5", paddingTop: 8 }}>
                <span className="small muted">{match.p.item}</span>
                <b className="num">Collect {pkr(match.p.cod)}</b>
              </div>
            </div>
            {match.manual && <div className="xs" style={{ color: "var(--amber-ink)" }}>Code was typed, not scanned. This is noted on the parcel.</div>}
            <button type="button" className="btn red xl" onClick={start}>Start ride</button>
            <button type="button" className="btn ghost" onClick={() => setMatch(null)}>Scan a different parcel</button>
          </>
        ) : (
          <>
            {problem ? (
              <div className="row" style={{ alignItems: "flex-start", gap: 10, background: "var(--red-tint)", border: "1px solid #f0c9c6", borderRadius: 12, padding: 12 }}>
                <span style={{ color: "var(--red)" }}><Icon name="info" /></span>
                <div className="small">{problem}</div>
              </div>
            ) : (
              <div className="small muted" style={{ textAlign: "center" }}>Point the camera at the QR on the box label. It scans by itself.</div>
            )}
            {typing ? (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typed.trim()) check(typed, true);
                }}
              >
                <label htmlFor="typed" className="sr-only">Tracking code</label>
                <input id="typed" className="input mono grow" autoFocus placeholder="e.g. RT1047-K7" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} />
                <button className="btn navy" type="submit">Check</button>
              </form>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setTyping(true)}>Label damaged? Type the code instead</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
