import { NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";
import { buildReport, pktDay, pktTime } from "@/lib/report";
import { cronSecret, getSettings, reportDayFor, saveSettings } from "@/lib/reportSettings";
import { adminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Called by the database every 15 minutes (see migration 007). Sends the daily report once a day,
 * at the first check after the time set in Admin › Settings.
 */
export async function POST(req: Request) {
  if (req.headers.get("x-cron-secret") !== cronSecret()) return NextResponse.json({ ok: false }, { status: 401 });
  const db = adminClient();
  const s = await getSettings(db);
  const today = pktDay();
  if (!s.enabled || !s.emails.length) return NextResponse.json({ ok: true, skipped: "off" });
  if (s.lastSentDay === today) return NextResponse.json({ ok: true, skipped: "already sent today" });
  if (pktTime() < s.time) return NextResponse.json({ ok: true, skipped: "not time yet" });

  // claim today first so two overlapping checks never send twice
  await saveSettings(db, { ...s, lastSentDay: today, lastResult: "Sending…" });
  try {
    const r = await buildReport(db, reportDayFor(s.time, today));
    const sent = await sendMail({ to: s.emails, subject: r.subject, html: r.html, text: r.text, attachments: [{ filename: `rider-trace-${r.day}.csv`, content: r.csv }] });
    await saveSettings(db, { ...s, lastSentDay: today, lastResult: `${today} ${pktTime()}: ${sent.message}` });
    return NextResponse.json(sent);
  } catch (e) {
    await saveSettings(db, { ...s, lastSentDay: today, lastResult: `${today} ${pktTime()}: failed (${(e as Error).message})` });
    return NextResponse.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
