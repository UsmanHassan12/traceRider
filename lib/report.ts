import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attempt, Reattempt } from "./types";

/**
 * Daily report, built on the server with the service-role client. Days are Pakistan days
 * (UTC+5, no daylight saving).
 */

const PKT = 5 * 3600e3;
/** yyyy-mm-dd of a moment in Pakistan time. */
export const pktDay = (t = Date.now()) => new Date(t + PKT).toISOString().slice(0, 10);
/** HH:MM of a moment in Pakistan time. */
export const pktTime = (t = Date.now()) => new Date(t + PKT).toISOString().slice(11, 16);
const dayStartMs = (d: string) => Date.parse(`${d}T00:00:00+05:00`);

interface Row {
  id: string;
  trk: string;
  customer: string;
  phone: string;
  area: string;
  cod: number;
  status: string;
  rider_id: string | null;
  created_at: string;
  attempt: Attempt | null;
  attempts: Reattempt[] | null;
  flags: string[] | null;
  archived_at?: string | null;
}

const COLS = "id,trk,customer,phone,area,cod,status,rider_id,created_at,attempt,attempts,flags,archived_at";

async function all<T>(build: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const clock = (t: number) => new Date(t + PKT).toISOString().slice(11, 16);

export interface Report {
  day: string;
  subject: string;
  html: string;
  text: string;
  csv: string;
}

/** Everything that happened on one Pakistan day, plus what is still open now. */
export async function buildReport(db: SupabaseClient, day = pktDay()): Promise<Report> {
  const from = dayStartMs(day);
  const to = from + 864e5 - 1;
  const ms = (t: number) => String(t).padStart(13, "0");
  const iso = (t: number) => new Date(t).toISOString();

  const [riders, created, closed, open, deposits, delivered, allDeposits, archived] = await Promise.all([
    all<{ id: string; name: string }>(() => db.from("riders").select("id,name").order("id") as never),
    all<Row>(() => db.from("parcels").select(COLS).eq("is_sample", false).gte("created_at", iso(from)).lte("created_at", iso(to)).order("id") as never),
    all<Row>(() => db.from("parcels").select(COLS).eq("is_sample", false).not("attempt", "is", null).gte("attempt->>at", ms(from)).lte("attempt->>at", ms(to)).order("id") as never),
    all<Row>(() => db.from("parcels").select(COLS).eq("is_sample", false).in("status", ["new", "labeled", "handed", "out", "returned"]).order("id") as never),
    all<{ rider_id: string; amount: number; declared: number | null; status: string | null; at: string; by: string }>(() =>
      db.from("deposits").select("rider_id,amount,declared,status,at,by").gte("at", iso(from)).lte("at", iso(to)).order("at") as never
    ),
    all<{ rider_id: string; cod: number }>(() => db.from("parcels").select("rider_id,cod").eq("is_sample", false).eq("status", "delivered").gt("cod", 0).order("id") as never),
    all<{ rider_id: string; amount: number }>(() => db.from("deposits").select("rider_id,amount").order("id") as never),
    all<{ id: string }>(() => db.from("parcels").select("id").eq("status", "archived").gte("archived_at", iso(from)).lte("archived_at", iso(to)).order("id") as never).catch(() => []),
  ]);

  const name = (id: string | null) => riders.find((r) => r.id === id)?.name ?? (id || "No rider");
  const del = closed.filter((p) => p.attempt?.outcome === "delivered");
  const ret = closed.filter((p) => p.attempt?.outcome === "returned");
  const flagged = ret.filter((p) => (p.flags ?? []).length);
  const collected = del.reduce((s, p) => s + (p.cod || 0), 0);
  const handedIn = deposits.reduce((s, d) => s + d.amount, 0);
  const returnRate = closed.length ? Math.round((ret.length / closed.length) * 100) : 0;

  // failed tries the riders chose to reattempt today (on open or closed parcels)
  const seen = new Map<string, Row>();
  for (const p of [...open, ...closed]) seen.set(p.id, p);
  const triesToday = Array.from(seen.values()).flatMap((p) => (p.attempts ?? []).filter((a) => a.at >= from && a.at <= to).map((a) => ({ p, a })));

  // cash each rider holds right now
  const owed = new Map<string, number>();
  for (const p of delivered) owed.set(p.rider_id, (owed.get(p.rider_id) ?? 0) + p.cod);
  for (const d of allDeposits) owed.set(d.rider_id, (owed.get(d.rider_id) ?? 0) - d.amount);
  const withRiders = Array.from(owed.values()).reduce((s, v) => s + Math.max(0, v), 0);

  const perRider = riders
    .map((r) => {
      const mine = closed.filter((p) => p.rider_id === r.id);
      const d = mine.filter((p) => p.attempt?.outcome === "delivered");
      const rt = mine.filter((p) => p.attempt?.outcome === "returned");
      return {
        name: r.name,
        delivered: d.length,
        returned: rt.length,
        flagged: rt.filter((p) => (p.flags ?? []).length).length,
        reattempts: triesToday.filter((x) => x.p.rider_id === r.id).length,
        collected: d.reduce((s, p) => s + (p.cod || 0), 0),
        handedIn: deposits.filter((x) => x.rider_id === r.id).reduce((s, x) => s + x.amount, 0),
        holds: Math.max(0, owed.get(r.id) ?? 0),
      };
    })
    .filter((r) => r.delivered || r.returned || r.reattempts || r.collected || r.handedIn || r.holds)
    .sort((a, b) => b.delivered + b.returned - (a.delivered + a.returned));

  const reasons = new Map<string, number>();
  for (const p of ret) reasons.set(p.attempt?.reason ?? "No reason", (reasons.get(p.attempt?.reason ?? "No reason") ?? 0) + 1);

  const now = {
    toPrint: open.filter((p) => p.status === "new").length,
    ready: open.filter((p) => p.status === "labeled").length,
    withRiders: open.filter((p) => p.status === "handed" || p.status === "out").length,
    reattemptPending: open.filter((p) => (p.status === "handed" || p.status === "out") && (p.attempts ?? []).length).length,
    comingBack: open.filter((p) => p.status === "returned").length,
  };
  const disputed = deposits.filter((d) => d.status === "disputed").length;

  const label = new Date(`${day}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
  const subject = `Rider Trace daily report · ${label} · ${del.length} delivered, ${ret.length} returned`;

  const th = 'style="text-align:left;padding:6px 10px;border-bottom:1px solid #e3e8ef;font-size:12px;color:#5b6b82"';
  const td = 'style="padding:6px 10px;border-bottom:1px solid #eef1f5;font-size:13px;white-space:nowrap"';
  const tile = (k: string, v: string, color = "#1f2b3d") =>
    `<td style="padding:10px 12px;background:#f5f7fa;border-radius:8px"><div style="font-size:11px;color:#5b6b82">${k}</div><div style="font-size:20px;font-weight:700;color:${color}">${v}</div></td>`;

  const html = `<!doctype html><html><body style="margin:0;background:#eef1f5;font-family:Poppins,Segoe UI,Arial,sans-serif;color:#1f2b3d">
<div style="max-width:680px;margin:0 auto;padding:20px">
  <div style="background:#A50505;color:#fff;border-radius:12px 12px 0 0;padding:18px 20px">
    <div style="font-size:12px;opacity:.85">Rider Trace · daily report</div>
    <div style="font-size:20px;font-weight:700">${esc(label)}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:18px 20px">
    <table cellspacing="8" style="width:100%;border-collapse:separate"><tr>
      ${tile("New orders", String(created.length))}${tile("Delivered", String(del.length), "#1f8a4c")}${tile("Returned", String(ret.length), "#A50505")}${tile("Return rate", `${returnRate}%`)}
    </tr><tr>
      ${tile("Reattempts marked", String(triesToday.length), "#9a6200")}${tile("Flagged returns", String(flagged.length), flagged.length ? "#A50505" : "#1f2b3d")}${tile("COD collected", pkr(collected))}${tile("Cash handed in", pkr(handedIn), "#1f8a4c")}
    </tr></table>

    <h3 style="font-size:15px;margin:18px 0 6px">Riders</h3>
    ${
      perRider.length
        ? `<table style="width:100%;border-collapse:collapse"><tr><th ${th}>Rider</th><th ${th}>Delivered</th><th ${th}>Returned</th><th ${th}>Flagged</th><th ${th}>Reattempts</th><th ${th}>Collected</th><th ${th}>Handed in</th><th ${th}>Holds now</th></tr>
      ${perRider.map((r) => `<tr><td ${td}><b>${esc(r.name)}</b></td><td ${td}>${r.delivered}</td><td ${td}>${r.returned}</td><td ${td}>${r.flagged ? `<b style="color:#A50505">${r.flagged}</b>` : "0"}</td><td ${td}>${r.reattempts}</td><td ${td}>${pkr(r.collected)}</td><td ${td}>${pkr(r.handedIn)}</td><td ${td}><b>${pkr(r.holds)}</b></td></tr>`).join("")}
      </table>`
        : '<div style="font-size:13px;color:#5b6b82">No rider activity.</div>'
    }

    ${
      reasons.size
        ? `<h3 style="font-size:15px;margin:18px 0 6px">Why parcels came back</h3><div style="font-size:13px">${Array.from(reasons.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([r, n]) => `${esc(r)}: <b>${n}</b>`)
            .join(" · ")}</div>`
        : ""
    }

    ${
      flagged.length
        ? `<h3 style="font-size:15px;margin:18px 0 6px;color:#A50505">Flagged returns to review</h3><table style="width:100%;border-collapse:collapse"><tr><th ${th}>Order</th><th ${th}>Rider</th><th ${th}>Reason</th><th ${th}>Flags</th></tr>${flagged
            .map((p) => `<tr><td ${td}>${esc(p.id)}</td><td ${td}>${esc(name(p.rider_id))}</td><td ${td}>${esc(p.attempt?.reason)}</td><td ${td}>${esc((p.flags ?? []).join(" · "))}</td></tr>`)
            .join("")}</table>`
        : ""
    }

    <h3 style="font-size:15px;margin:18px 0 6px">Open right now</h3>
    <div style="font-size:13px;line-height:1.7">
      Labels to print: <b>${now.toPrint}</b> · Ready to hand over: <b>${now.ready}</b> · With riders: <b>${now.withRiders}</b>
      (reattempts pending: <b>${now.reattemptPending}</b>) · Returns not checked in: <b>${now.comingBack}</b><br/>
      Cash with riders: <b>${pkr(withRiders)}</b>${disputed ? ` · <span style="color:#A50505">Disputed cash handovers today: <b>${disputed}</b></span>` : ""}${archived.length ? ` · Archived today (not delivered in 7 days): <b>${archived.length}</b>` : ""}
    </div>

    <div style="font-size:11px;color:#8a97a8;margin-top:18px">All orders of the day are attached as a CSV. Sent by Rider Trace at ${pktTime()} Pakistan time.</div>
  </div>
</div></body></html>`;

  const text = [
    `Rider Trace daily report: ${label}`,
    `New orders ${created.length} · Delivered ${del.length} · Returned ${ret.length} (${returnRate}%) · Reattempts ${triesToday.length} · Flagged ${flagged.length}`,
    `COD collected ${pkr(collected)} · Handed in ${pkr(handedIn)} · With riders now ${pkr(withRiders)}`,
    "",
    ...perRider.map((r) => `${r.name}: ${r.delivered} delivered, ${r.returned} returned (${r.flagged} flagged), ${r.reattempts} reattempts, holds ${pkr(r.holds)}`),
  ].join("\n");

  const rows = new Map<string, Row>();
  for (const p of [...created, ...closed]) rows.set(p.id, p);
  for (const { p } of triesToday) rows.set(p.id, p);
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv =
    "﻿" +
    [
      ["Order", "Tracking", "Arrived", "Customer", "Phone", "Area", "Rider", "Status", "Outcome", "Reason", "Closed at", "Failed tries", "COD", "Flags"],
      ...Array.from(rows.values()).map((p) => [
        p.id, p.trk, new Date(p.created_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi" }), p.customer, p.phone, p.area, name(p.rider_id), p.status,
        p.attempt?.outcome ?? "", p.attempt?.reason ?? "", p.attempt ? `${new Date(p.attempt.at).toISOString().slice(0, 10)} ${clock(p.attempt.at)}` : "",
        (p.attempts ?? []).length, p.cod, (p.flags ?? []).join("; "),
      ]),
    ]
      .map((r) => r.map(q).join(","))
      .join("\n");

  return { day, subject, html, text, csv };
}
