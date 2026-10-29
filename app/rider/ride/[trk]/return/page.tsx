"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { DemoDistance } from "@/components/DemoDistance";
import { Icon } from "@/components/Icon";
import { PhotoCapture } from "@/components/PhotoCapture";
import { useToast } from "@/components/Toast";
import { fmtDistance, time } from "@/lib/format";
import { RULES } from "@/lib/rules";
import type { ReturnReason } from "@/lib/types";
import { useDistance } from "@/lib/useDistance";
import { useRider } from "@/lib/useRider";

const REASONS: ReturnReason[] = ["Customer not available", "Phone switched off", "Customer refused parcel", "Wrong or incomplete address", "Customer asked to reschedule"];

function Check({ ok, title, children }: { ok: boolean; title: string; children?: React.ReactNode }) {
  return (
    <section className={`card ${ok ? "" : "fail-soft"}`} style={{ borderRadius: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className={`check ${ok ? "ok" : ""}`}>
        <span className="dot">{ok ? <Icon name="check" size={14} stroke={3} /> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}</span>
        <div className="grow" style={{ fontWeight: 600, paddingTop: 2 }}>{title}</div>
      </div>
      {children}
    </section>
  );
}

export default function ReturnPage() {
  const { trk } = useParams<{ trk: string }>();
  const code = decodeURIComponent(trk);
  const { state, rider, logCall, markReturn } = useRider();
  const router = useRouter();
  const toast = useToast();
  const p = state.parcels.find((x) => x.trk === code);
  const { distance, gps, gpsError, demo, setDemo, isDemo } = useDistance(p?.lat ?? 0, p?.lng ?? 0);
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [photo, setPhoto] = useState<string | undefined>();

  if (!rider) return null;
  if (!p || p.riderId !== rider.id || p.status !== "out") {
    return (
      <div className="phone-main">
        <div className="empty">This ride is not live any more.</div>
        <Link href="/rider" className="btn">Back to home</Link>
      </div>
    );
  }

  const callsOk = p.calls.length >= RULES.minCalls;
  const photoOk = !RULES.photoRequired || !!photo;
  const near = distance !== null && distance <= RULES.maxDistanceM;
  const passed = [!!reason, callsOk, photoOk, near].filter(Boolean).length;
  const canSave = RULES.mode === "flag" ? !!reason : passed === 4;

  function save() {
    if (!reason) return;
    const r = markReturn(p!.id, { reason, distanceM: distance ?? 99999, photo });
    if (!r.ok) return toast(r.message, "bad");
    toast(r.message, r.flags && r.flags.length ? "bad" : "good");
    router.replace("/rider");
  }

  return (
    <>
      <div className="topbar">
        <Link href={`/rider/ride/${encodeURIComponent(p.trk)}`} className="icon-btn" aria-label="Back to ride">
          <Icon name="back" stroke={2.2} />
        </Link>
        <div>
          <div style={{ fontWeight: 600, fontSize: 17 }}>Can&apos;t deliver</div>
          <div className="xs muted mono">{p.trk} · {p.customer}</div>
        </div>
      </div>

      <div className="phone-main" style={{ paddingBottom: 32 }}>
        <div className="small muted">A return is saved only when all four checks pass. The customer also gets an SMS asking whether you visited.</div>

        <Check ok={!!reason} title="Reason">
          <div className="row wrap" style={{ gap: 6 }}>
            {REASONS.map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>
                {r}
              </button>
            ))}
          </div>
        </Check>

        <Check ok={callsOk} title={callsOk ? "Called the customer" : `Call the customer ${RULES.minCalls} times`}>
          <div className="row between">
            <span className="small muted">
              {p.calls.length === 0 ? "No calls yet" : `${p.calls.length} call${p.calls.length > 1 ? "s" : ""} from the app · ${p.calls.map(time).join(", ")}`}
            </span>
            <a href={`tel:${p.phone}`} onClick={() => logCall(p.id)} className="btn sm green" style={{ flex: "none" }}>
              <Icon name="phone" size={16} /> Call
            </a>
          </div>
        </Check>

        <Check ok={photoOk} title="Photo at the door">
          <div className="small muted">Taken in the app, stamped with time and GPS.</div>
          <PhotoCapture id="ret-photo" value={photo} onChange={setPhoto} />
        </Check>

        <section className={near ? "card" : "card fail"} style={{ borderRadius: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className={`check ${near ? "ok" : "fail"}`}>
            <span className="dot">{near ? <Icon name="check" size={14} stroke={3} /> : <Icon name="alert" size={14} stroke={3} />}</span>
            <div className="grow">
              <div style={{ fontWeight: 600, color: near ? undefined : "var(--red)" }}>
                {distance === null ? "Finding your location…" : near ? `You're at the address (${fmtDistance(distance)})` : `You are ${fmtDistance(distance)} from the address`}
              </div>
              {!near && <div className="small muted">{gpsError && !isDemo ? gpsError : "Go to the customer's door to mark this return."}</div>}
            </div>
          </div>
          {!near && (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noreferrer" className="btn sm" style={{ color: "var(--red)" }}>
              Navigate to address
            </a>
          )}
          {isDemo && <DemoDistance value={demo} onChange={setDemo} gps={gps} />}
        </section>

        <button type="button" className="btn red xl" disabled={!canSave} onClick={save} style={{ marginTop: 6 }}>
          {canSave ? "Confirm return" : `Confirm return · ${passed} of 4 checks`}
        </button>
      </div>
    </>
  );
}
