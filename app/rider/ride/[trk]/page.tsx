"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DemoDistance } from "@/components/DemoDistance";
import { Icon } from "@/components/Icon";
import { PhotoCapture } from "@/components/PhotoCapture";
import { useToast } from "@/components/Toast";
import { ago, fmtDistance, pkr } from "@/lib/format";
import { DEMO, RULES } from "@/lib/rules";
import { useDistance } from "@/lib/useDistance";
import { useRider } from "@/lib/useRider";

export default function RidePage() {
  const { trk } = useParams<{ trk: string }>();
  const code = decodeURIComponent(trk);
  const { state, rider, logCall, deliver } = useRider();
  const router = useRouter();
  const toast = useToast();
  const p = state.parcels.find((x) => x.trk === code);
  const { distance, gps, gpsError, demo, setDemo, isDemo, noPin } = useDistance(p?.lat ?? null, p?.lng ?? null);
  const [delivering, setDelivering] = useState(false);
  const [otp, setOtp] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!rider) return null;
  if (!p || p.riderId !== rider.id) {
    return (
      <div className="phone-main">
        <div className="empty">This parcel is not on your list.</div>
        <Link href="/rider" className="btn">Back to home</Link>
      </div>
    );
  }
  if (p.status !== "out") {
    return (
      <div className="phone-main">
        <div className="empty">This ride is closed ({p.status}).</div>
        <Link href="/rider" className="btn">Back to home</Link>
      </div>
    );
  }

  const dest = p.lat !== null && p.lng !== null ? `${p.lat},${p.lng}` : encodeURIComponent(p.address);
  const mapsDir = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  const embed = `https://maps.google.com/maps?q=${dest}&z=15&output=embed`;

  function confirmDelivery() {
    if (!noPin && distance === null) return toast("Turn on location so the delivery can be checked against the address.", "bad");
    const r = deliver(p!.id, { otp, distanceM: noPin ? -1 : distance ?? -1, photo });
    if (!r.ok) return toast(r.message, "bad");
    toast(r.message, "good");
    router.replace("/rider");
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#e9edf0" }}>
      <div style={{ position: "relative", height: "42dvh", minHeight: 260 }}>
        <iframe title={`Map of ${p.address}`} src={embed} style={{ border: 0, width: "100%", height: "100%" }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <div className="row between" style={{ position: "absolute", left: 16, right: 16, top: 16 }}>
          <Link href="/rider" className="icon-btn" aria-label="Back" style={{ background: "#fff", boxShadow: "0 2px 8px rgba(31,43,61,.15)" }}>
            <Icon name="back" stroke={2.2} />
          </Link>
          <div className="row small" style={{ background: "#fff", borderRadius: 99, padding: "8px 14px", boxShadow: "0 2px 8px rgba(31,43,61,.15)", fontWeight: 600, gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: gpsError && !isDemo ? "var(--red)" : "#3fbf7f" }} />
            Live · {ago(p.rideStartedAt ?? Date.now())}
          </div>
        </div>
      </div>

      <div className="sheet" style={{ flex: 1, marginTop: -18, position: "relative" }}>
        <div className="grabber" />
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6, fontSize: 11, textAlign: "center" }} className="muted">
          {["Scanned", "On the way", "At the door", "Closed"].map((s, i) => {
            const atDoor = (distance ?? Infinity) <= RULES.maxDistanceM;
            const done = i === 0 || (i === 1 && atDoor);
            const current = (i === 1 && !atDoor) || (i === 2 && atDoor);
            return (
              <li key={s} style={{ display: "flex", flexDirection: "column", gap: 5, color: current ? "var(--navy)" : undefined, fontWeight: current ? 600 : 400 }}>
                <span style={{ height: 4, borderRadius: 2, background: done ? "var(--green)" : current ? "var(--navy)" : "var(--line)" }} />
                {s}
              </li>
            );
          })}
        </ol>

        <div className="row" style={{ gap: 12 }}>
          <div className="grow">
            <div style={{ fontWeight: 600, fontSize: 17 }}>{p.customer}</div>
            <div className="small muted">{p.address}</div>
            <div className="xs muted mono">{p.trk} · {p.item}</div>
          </div>
          <a
            href={`tel:${p.phone}`}
            onClick={() => logCall(p.id)}
            aria-label={`Call ${p.customer}`}
            style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--green-soft)", color: "var(--green)", display: "grid", placeItems: "center", flex: "none" }}
          >
            <Icon name="phone" size={22} />
          </a>
        </div>

        <div className="row between tile" style={{ padding: "12px 14px" }}>
          <span className="small muted">Cash to collect</span>
          <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{pkr(p.cod)}</span>
        </div>

        <div className="row xs muted" style={{ gap: 8 }}>
          <Icon name="info" size={16} />
          <span>
            Calls go through the app and are logged. {p.calls.length} call{p.calls.length === 1 ? "" : "s"} so far.
            {noPin ? " This address has no map pin from Shopify." : distance !== null ? ` You are ${fmtDistance(distance)} from the address.` : gpsError ? ` ${gpsError}` : " Finding your location…"}
          </span>
        </div>

        {isDemo && <DemoDistance value={demo} onChange={setDemo} gps={gps} />}

        <a href={mapsDir} target="_blank" rel="noreferrer" className="btn">
          <Icon name="nav" size={18} /> Navigate in Google Maps
        </a>

        <div className="grid2" style={{ marginTop: "auto" }}>
          <Link href={`/rider/ride/${encodeURIComponent(p.trk)}/return`} className="btn xl" style={{ border: "2px solid var(--line-2)" }}>
            Can&apos;t deliver
          </Link>
          <button type="button" className="btn green xl" onClick={() => setDelivering(true)}>
            <Icon name="check" stroke={2.6} /> Delivered
          </button>
        </div>
        <div className="xs muted" style={{ textAlign: "center", marginTop: -4 }}>
          {RULES.requireOtp ? "Delivered asks for the customer's 4-digit SMS code" : "Delivered asks for a photo of the handover"}
        </div>
      </div>

      {delivering && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setDelivering(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dlv-title">
            <h2 id="dlv-title">Confirm delivery</h2>
            <div className="small muted">{p.customer} · collect <b style={{ color: "var(--ink)" }}>{pkr(p.cod)}</b></div>
            {RULES.requireOtp && (
              <div className="field">
                <label htmlFor="otp">Customer&apos;s 4-digit code</label>
                <input id="otp" className="input mono" inputMode="numeric" maxLength={4} autoFocus value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} style={{ fontSize: 22, letterSpacing: ".3em", textAlign: "center" }} />
                {DEMO && <span className="xs" style={{ color: "var(--amber-ink)" }}>Demo: the customer&apos;s code is {p.otp}</span>}
              </div>
            )}
            <div className="field">
              <span style={{ fontSize: 13, fontWeight: 500 }}>Photo of the handover{RULES.requireOtp ? " (optional)" : ""}</span>
              <PhotoCapture id="dlv-photo" value={photo} onChange={setPhoto} />
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setDelivering(false)}>Cancel</button>
              <button type="button" className="btn green" disabled={RULES.requireOtp ? otp.length !== 4 : !photo} onClick={confirmDelivery}>Confirm delivery</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
