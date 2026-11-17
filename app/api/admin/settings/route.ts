import { NextResponse } from "next/server";
import { mailConfigured, sendMail } from "@/lib/mailer";
import { buildReport, pktDay } from "@/lib/report";
import { cronSecret, getSettings, reportDayFor, saveSettings, validEmail, type ReportSettings } from "@/lib/reportSettings";
import { adminClient, requireAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const bad = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

/** Daily report settings, plus whether email is set up on the server. */
export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return bad("Only admins can do this.", 403);
  try {
    const settings = await getSettings(adminClient());
    return NextResponse.json({ ok: true, settings, mailReady: mailConfigured() });
  } catch (e) {
    return bad((e as Error).message, 500);
  }
}

interface Body {
  action: "save" | "test";
  enabled?: boolean;
  emails?: string[];
  time?: string;
}

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return bad("Only admins can do this.", 403);
  const body = (await req.json().catch(() => ({}))) as Body;
  const db = adminClient();

  let current: ReportSettings;
  try {
    current = await getSettings(db);
  } catch (e) {
    return bad((e as Error).message, 500);
  }

  if (body.action === "test") {
    const to = (body.emails ?? current.emails).map((e) => e.trim()).filter(Boolean);
    if (!to.length) return bad("Add at least one email address first.");
    if (to.some((e) => !validEmail(e))) return bad("One of the email addresses is not valid.");
    try {
      const time = body.time ?? current.time;
      const r = await buildReport(db, reportDayFor(time, pktDay()));
      const sent = await sendMail({ to, subject: `[Test] ${r.subject}`, html: r.html, text: r.text, attachments: [{ filename: `rider-trace-${r.day}.csv`, content: r.csv }] });
      return NextResponse.json(sent, { status: sent.ok ? 200 : 502 });
    } catch (e) {
      return bad((e as Error).message, 500);
    }
  }

  // save
  const emails = Array.from(new Set((body.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean)));
  const time = body.time ?? current.time;
  const enabled = !!body.enabled;
  if (emails.some((e) => !validEmail(e))) return bad(`Not a valid email: ${emails.find((e) => !validEmail(e))}`);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return bad("Pick a time.");
  if (enabled && !emails.length) return bad("Add at least one email address to turn the daily report on.");
  if (emails.length > 20) return bad("Up to 20 email addresses.");

  const next: ReportSettings = { ...current, emails, time, enabled };
  try {
    await saveSettings(db, next);
    // point the database's 15-minute check at this app (or switch it off)
    const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const { error } = await db.rpc("set_report_schedule", { url: enabled ? `${origin}/api/reports/daily` : "", secret: cronSecret() });
    if (error) return bad(`Settings saved, but the schedule could not be set: ${error.message}. Run migration 007 in Supabase.`, 500);
  } catch (e) {
    return bad((e as Error).message, 500);
  }
  return NextResponse.json({
    ok: true,
    settings: next,
    message: enabled ? `Daily report on: ${emails.length} recipient${emails.length > 1 ? "s" : ""} at ${time} every day.` : "Daily report turned off.",
  });
}
