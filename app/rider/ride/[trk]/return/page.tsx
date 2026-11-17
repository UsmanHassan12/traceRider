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
import { storeProof } from "@/lib/photos";
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
  const { state, rider, logCall, markReturn, markReattempt } = useRider();
  const router = useRouter();
  const toast = useToast();
  const p = state.parcels.find((x) => x.trk === code);
  const { distance, gps, here, gpsError, demo, setDemo, isDemo, noPin } = useDistance(p?.lat ?? null, p?.lng ?? null);
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [photo, setPhoto] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

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
  const near = noPin ? !!here || isDemo : distance !== null && distance <= RULES.maxDistanceM;
  const dest = p.lat !== null && p.lng !== null ? `${p.lat},${p.lng}` : encodeURIComponent(p.address);
  const checks = RULES.distanceRequired ? [!!reason, callsOk, photoOk, near] : [!!reason, callsOk, photoOk];
  const passed = checks.filter(Boolean).length;
  const canSave = RULES.mode === "flag" ? !!reason : passed === checks.length;
  // location is advisory when not required: amber instead of red, and it never blocks saving
  const locTone = near ? "ok" : RULES.distanceRequired ? "fail" : "warn";

  async function save(kind: "return" | "reattempt") {
    if (!reason) return;
    setSaving(true);
    const stored = await storeProof(p!.id, photo);
    setSaving(false);
    const input = { reason, distanceM: noPin ? -1 : distance ?? 99999, photo: stored, where: here ?? undefined };
    if (kind === "reattempt") {
      const r = markReattempt(p!.id, input);
      if (!r.ok) return toast(r.message, "bad");
      toast(r.message, "good");
      return router.replace("/rider");
    }
    const r = markReturn(p!.id, input);
    if (!r.ok) return toast(r.message, "bad");
    toast(r.message, r.flags && r.flags.length ? "bad" : "good");
    router.replace("/rider");
  }
  const tries = (p.attempts?.length ?? 0) + 1;

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
        <div className="small muted">
          {tries > 1 ? `Attempt ${tries} for this parcel. ` : ""}Pick a reason, then choose: <b>Reattempt</b> keeps the parcel with you to try again later; <b>Return</b> sends it back to the warehouse for good.
        </div>

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

        <section className={locTone === "fail" ? "card fail" : "card"} style={{ borderRadius: 14, display: "flex", flexDirection: "column", gap: 10, ...(locTone === "warn" ? { border: "2px solid var(--amber)", background: "var(--amber-soft)" } : {}) }}>
          <div className={`check ${locTone === "warn" ? "" : locTone}`}>
            <span className="dot" style={locTone === "warn" ? { background: "var(--amber)" } : undefined}>{near ? <Icon name="check" size={14} stroke={3} /> : <Icon name="alert" size={14} stroke={3} />}</span>
            <div className="grow">
              <div style={{ fontWeight: 600, color: near ? undefined : locTone === "warn" ? "var(--amber-ink)" : "var(--red)" }}>
                {noPin
                  ? here
                    ? "Location recorded (this address has no map pin to compare)"
                    : gpsError ?? "Finding your location…"
                  : distance === null
                    ? gpsError ?? "Finding your location…"
                    : near
                      ? `You're at the address (${fmtDistance(distance)})`
                      : `You are ${fmtDistance(distance)} from the address`}
              </div>
              {!near && (
                <div className="small muted">
                  {gpsError && !isDemo
                    ? gpsError
                    : RULES.distanceRequired
                      ? "Go to the customer's door to mark this return."
                      : "You can still save. The return will be flagged for the admin to review your location."}
                </div>
              )}
            </div>
          </div>
          {!near && (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${dest}`} target="_blank" rel="noreferrer" className="btn sm" style={{ color: locTone === "warn" ? "var(--amber-ink)" : "var(--red)" }}>
              Navigate to address
            </a>
          )}
          {isDemo && <DemoDistance value={demo} onChange={setDemo} gps={gps} />}
        </section>

        <section className="card stack" style={{ borderRadius: 14, gap: 10, marginTop: 6 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Try again later</div>
            <div className="xs muted">The parcel stays with you and comes back to your list as a reattempt. Your calls, photo and location for this try are saved.</div>
          </div>
          <button type="button" className="btn navy xl" disabled={!reason || saving} onClick={() => save("reattempt")}>
            <Icon name="undo" size={18} /> {reason ? "Reattempt later" : "Pick a reason to reattempt"}
          </button>
        </section>

        <section className="card stack" style={{ borderRadius: 14, gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Return to warehouse</div>
            <div className="xs muted">Final. You can&apos;t deliver this parcel again after this. Needs all the checks above.</div>
          </div>
          <button type="button" className="btn red xl" disabled={!canSave || saving} onClick={() => save("return")}>
            {canSave ? "Confirm return" : `Confirm return · ${passed} of ${checks.length} checks`}
          </button>
        </section>
      </div>
    </>
  );
}
