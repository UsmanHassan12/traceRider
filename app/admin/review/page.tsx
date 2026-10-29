"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PhotoThumb } from "@/components/PhotoCapture";
import { useToast } from "@/components/Toast";
import { fmtDistance, initials, isToday, pkr, time } from "@/lib/format";
import { RULES } from "@/lib/rules";
import { useStore } from "@/lib/store";
import type { Parcel, ReviewDecision } from "@/lib/types";

export default function ReviewPage() {
  return (
    <Suspense fallback={<div aria-busy="true" />}>
      <Review />
    </Suspense>
  );
}

function Review() {
  const { state, saveReview } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"open" | "done">("open");

  const flagged = state.parcels
    .filter((p) => p.attempt?.outcome === "returned" && p.flags.length && isToday(p.attempt.at))
    .sort((a, b) => b.attempt!.at - a.attempt!.at);
  const open = flagged.filter((p) => !p.review);
  const done = flagged.filter((p) => p.review);
  const list = tab === "open" ? open : done;
  const selId = params.get("id") ?? list[0]?.id;
  const p = flagged.find((x) => x.id === selId) ?? list[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <header className="row between wrap" style={{ background: "#fff", borderBottom: "1px solid var(--line)", padding: "14px 28px", gap: 12 }}>
        <nav aria-label="Breadcrumb" className="row small muted" style={{ gap: 8 }}>
          <Link href="/admin" style={{ textDecoration: "none" }}>Overview</Link><span>/</span><span>Returns review</span>
          {p && (<><span>/</span><b className="mono" style={{ color: "var(--ink)" }}>{p.trk}</b></>)}
        </nav>
        <span className="small muted">{flagged.length} flagged today · {done.length} reviewed</span>
      </header>

      <div className="row wrap" style={{ gap: 16, padding: "20px 28px 40px", alignItems: "flex-start", maxWidth: 1440 }}>
        <section aria-label="Review queue" className="card" style={{ flex: "1 1 260px", minWidth: 0, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="row" style={{ gap: 6, padding: 8 }}>
            <button type="button" className="chip" aria-pressed={tab === "open"} onClick={() => setTab("open")}>To review {open.length}</button>
            <button type="button" className="chip" aria-pressed={tab === "done"} onClick={() => setTab("done")}>Done {done.length}</button>
          </div>
          {list.length === 0 && <div className="small muted" style={{ padding: 12 }}>{tab === "open" ? "All flagged returns are reviewed." : "Nothing reviewed yet."}</div>}
          {list.map((x) => {
            const active = x.id === p?.id;
            return (
              <Link
                key={x.id}
                href={`/admin/review?id=${encodeURIComponent(x.id)}`}
                style={{ display: "flex", flexDirection: "column", gap: 3, padding: "10px 12px", borderRadius: 9, textDecoration: "none", color: "var(--ink)", background: active ? "var(--navy-soft)" : "transparent", borderLeft: `3px solid ${active ? "var(--navy)" : "transparent"}` }}
              >
                <span className="row between"><span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{x.trk}</span><span className="xs muted">{time(x.attempt!.at)}</span></span>
                <span className="small">{state.riders.find((r) => r.id === x.riderId)?.name}</span>
                <span className="xs" style={{ color: "var(--red)" }}>{x.flags.join(" · ")}</span>
              </Link>
            );
          })}
        </section>

        {p ? (
          <Detail key={p.id} p={p} onSave={(d, note, resend) => {
            saveReview(p.id, { decision: d, note, resend });
            toast("Decision saved.", "good");
            const next = open.find((x) => x.id !== p.id);
            router.push(next ? `/admin/review?id=${encodeURIComponent(next.id)}` : "/admin/review");
          }} />
        ) : (
          <div className="empty" style={{ flex: "3 1 520px" }}>No flagged returns today.</div>
        )}
      </div>
    </div>
  );
}

function Detail({ p, onSave }: { p: Parcel; onSave: (d: ReviewDecision, note: string, resend: boolean) => void }) {
  const { state } = useStore();
  const a = p.attempt!;
  const rider = state.riders.find((r) => r.id === p.riderId);
  const [decision, setDecision] = useState<ReviewDecision>(p.review?.decision ?? "rider");
  const [note, setNote] = useState(p.review?.note ?? "");
  const [resend, setResend] = useState(p.review?.resend ?? true);
  useEffect(() => {
    setDecision(p.review?.decision ?? "rider");
  }, [p.review?.decision]);

  const far = a.distanceM > RULES.maxDistanceM;
  const fewCalls = a.calls < RULES.minCalls;
  const noPhoto = !a.photo;
  const disputed = !!a.customerReply && /no one came|nobody came|was home/i.test(a.customerReply);
  const failed = [far, fewCalls, noPhoto, disputed].filter(Boolean).length;

  const week = state.parcels.filter((x) => x.riderId === p.riderId && x.attempt && Date.now() - x.attempt.at < 7 * 864e5);
  const wRet = week.filter((x) => x.attempt!.outcome === "returned");
  const team = state.parcels.filter((x) => x.attempt && Date.now() - x.attempt.at < 7 * 864e5);
  const teamRate = team.length ? Math.round((team.filter((x) => x.attempt!.outcome === "returned").length / team.length) * 100) : 0;
  const confirmed = wRet.filter((x) => x.review?.decision === "rider").length;

  const ev = (bad: boolean, label: string, value: string, sub: string, extra?: React.ReactNode) => (
    <div style={{ border: `1px solid ${bad ? "#f0c9c6" : "var(--line)"}`, background: bad ? "var(--red-tint)" : "#fff", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="xs" style={{ color: bad ? "var(--red)" : "var(--green)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
      <div className="xs muted">{sub}</div>
      {extra}
    </div>
  );

  return (
    <>
      <div className="stack" style={{ flex: "3 1 520px", minWidth: 0, gap: 16 }}>
        <section className="card pad-lg stack" style={{ gap: 14 }}>
          <div className="row between wrap" style={{ alignItems: "flex-start" }}>
            <div>
              <h1>Marked &ldquo;{a.reason}&rdquo;</h1>
              <div className="small muted" style={{ marginTop: 2 }}>
                {rider?.name} · {time(a.at)} · Order {p.id} · {p.customer}, {p.address} · COD {pkr(p.cod)}
              </div>
            </div>
            <span className="pill bad">{failed} of 4 checks failed</span>
          </div>

          <div style={{ position: "relative", height: 230, borderRadius: 10, overflow: "hidden", background: "#e9edf0" }}>
            <iframe title={`Map of ${p.address}`} src={`https://maps.google.com/maps?q=${p.lat},${p.lng}&z=14&output=embed`} style={{ border: 0, width: "100%", height: "100%" }} loading="lazy" />
            <div className="small" style={{ position: "absolute", right: 12, top: 12, background: far ? "var(--red)" : "var(--green)", color: "#fff", borderRadius: 99, padding: "5px 12px", fontWeight: 600 }}>
              Marked {fmtDistance(a.distanceM)} from the address
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            {ev(far, "Location", `${fmtDistance(a.distanceM)} from address`, `Limit is ${RULES.maxDistanceM} m`)}
            {ev(fewCalls, "Calls", `${a.calls} call${a.calls === 1 ? "" : "s"} from app`, `Required: ${RULES.minCalls} before a return`)}
            {ev(noPhoto, "Photo", noPhoto ? "No photo" : "Doorstep photo taken", noPhoto ? "Required for every return" : time(a.at), !noPhoto ? <PhotoThumb src={a.photo} size={64} /> : undefined)}
            {ev(disputed, "Customer SMS reply", a.customerReply ? `"${a.customerReply}"` : "No reply yet", a.customerReply ? "Customer disputes the visit" : "SMS sent after the return")}
          </div>
          {a.manualScan && <div className="xs" style={{ color: "var(--amber-ink)" }}>The rider typed the tracking code instead of scanning the QR.</div>}
        </section>

        <section className="card pad-lg stack">
          <h2>Custody log</h2>
          <ol style={{ listStyle: "none", margin: 0, padding: "0 0 0 16px", borderLeft: "2px solid var(--line)", display: "flex", flexDirection: "column", gap: 12 }}>
            {p.events.map((e, i) => (
              <li key={i} className="row wrap small" style={{ position: "relative", gap: "4px 14px", alignItems: "baseline" }}>
                <span style={{ position: "absolute", left: -23, top: 5, width: 12, height: 12, borderRadius: "50%", border: "2px solid #fff", background: e.kind === "bad" ? "var(--red)" : e.kind === "good" ? "var(--green)" : "var(--navy)" }} />
                <span className="mono muted" style={{ width: 74 }}>{time(e.at)}</span>
                <span className="grow" style={{ minWidth: 200 }}>{e.what}</span>
                <span className="xs muted">{e.by}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="stack" style={{ flex: "1 1 290px", minWidth: 0, gap: 16 }}>
        <section className="card pad-lg stack">
          <h2>Your decision</h2>
          <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <legend className="sr-only">Who is responsible</legend>
            {([
              ["rider", "Rider fault", `Counts against ${rider?.name.split(" ")[0] ?? "the rider"}'s record`],
              ["customer", "Customer fault", "Clears the flag"],
              ["check", "Need to check more", "Keeps it open for follow-up"],
            ] as [ReviewDecision, string, string][]).map(([v, label, sub]) => (
              <label key={v} className="row" style={{ gap: 10, border: decision === v ? "2px solid var(--navy)" : "1px solid var(--line-2)", background: decision === v ? "var(--navy-soft)" : "#fff", borderRadius: 10, padding: "10px 12px", minHeight: 48, cursor: "pointer" }}>
                <input type="radio" name="decision" value={v} checked={decision === v} onChange={() => setDecision(v)} style={{ accentColor: "var(--navy)" }} />
                <span><b style={{ display: "block" }}>{label}</b><span className="xs muted">{sub}</span></span>
              </label>
            ))}
          </fieldset>
          <label className="row small" style={{ gap: 10 }}>
            <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--navy)" }} />
            Send again tomorrow with a different rider
          </label>
          <div className="field">
            <label htmlFor="rv-note">Note for the record</label>
            <textarea id="rv-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you find?" />
          </div>
          <button type="button" className="btn navy" onClick={() => onSave(decision, note, resend)}>
            {p.review ? "Update decision" : "Save and open next"}
          </button>
        </section>

        <section className="card pad-lg stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="avatar" style={{ width: 38, height: 38 }}>{rider ? initials(rider.name) : "?"}</span>
            <div><b>{rider?.name}</b><div className="xs muted">Last 7 days</div></div>
          </div>
          <div className="grid2 num">
            <div className="tile" style={{ background: "var(--red-tint)" }}><div style={{ fontSize: 20, fontWeight: 700, color: "var(--red)" }}>{week.length ? Math.round((wRet.length / week.length) * 100) : 0}%</div><div className="xs muted">Return rate (team {teamRate}%)</div></div>
            <div className="tile"><div style={{ fontSize: 20, fontWeight: 700 }}>{wRet.filter((x) => x.flags.length).length}</div><div className="xs muted">Flagged returns</div></div>
            <div className="tile"><div style={{ fontSize: 20, fontWeight: 700 }}>{confirmed}</div><div className="xs muted">Confirmed rider fault</div></div>
            <div className="tile"><div style={{ fontSize: 20, fontWeight: 700 }}>{wRet.length ? (wRet.reduce((s, x) => s + x.attempt!.calls, 0) / wRet.length).toFixed(1) : "0.0"}</div><div className="xs muted">Calls per return</div></div>
          </div>
        </section>
      </aside>
    </>
  );
}
