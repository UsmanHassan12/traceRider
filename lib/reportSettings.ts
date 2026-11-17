import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReportSettings {
  enabled: boolean;
  emails: string[];
  time: string; // HH:MM, Pakistan time
  lastSentDay?: string; // yyyy-mm-dd of the last automatic send
  lastResult?: string; // what happened the last time it ran
}

export const DEFAULT_SETTINGS: ReportSettings = { enabled: false, emails: [], time: "22:00" };
const KEY = "daily_report";

export async function getSettings(db: SupabaseClient): Promise<ReportSettings> {
  const { data, error } = await db.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  if (error) throw new Error(/app_settings/.test(error.message) ? "Run supabase/migrations/007_reattempts_daily_report.sql in Supabase first." : error.message);
  return { ...DEFAULT_SETTINGS, ...((data?.value as Partial<ReportSettings>) ?? {}) };
}

export async function saveSettings(db: SupabaseClient, s: ReportSettings): Promise<void> {
  const { error } = await db.from("app_settings").upsert({ key: KEY, value: s, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Shared secret for the database's scheduled call, derived from the server key (no extra setting needed). */
export function cronSecret(): string {
  const base = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createHash("sha256").update(`rider-trace-daily-report:${base}`).digest("hex");
}

/** Reports sent before noon cover yesterday; from noon on they cover the same day so far. */
export function reportDayFor(time: string, today: string): string {
  if (time >= "12:00") return today;
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
