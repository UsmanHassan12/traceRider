import type { Rider } from "./types";

export type CashCode =
  | { ok: true; riderId: string; declared?: number; requestId?: string }
  | { ok: false; message: string };

/**
 * Reads the rider's cash QR: DEPOSIT|<rider id>|<declared amount>|<one-time code>.
 * Handheld scanners set to a non-US keyboard often type "|" as another character, and some send
 * everything in upper or lower case, so any of those separators and either case are accepted.
 * Returns null when the text is not a cash code at all (for example a parcel label).
 */
export function parseCashCode(raw: string, riders: Rider[]): CashCode | null {
  const text = raw.trim();
  if (!/^deposit/i.test(text)) return null;
  const parts = text.split(/[|¦\\~^<>!§°]/).map((s) => s.trim());
  const [, rid = "", amt = "", reqId = ""] = parts;
  const rider = riders.find((r) => r.id.toLowerCase() === rid.toLowerCase());
  if (!rider) return { ok: false, message: rid ? `No rider with ID ${rid}` : "This cash code could not be read. Scan it again or use the camera." };
  const declared = Number(amt);
  const requestId = reqId ? reqId.toUpperCase() : undefined;
  return { ok: true, riderId: rider.id, declared: requestId && Number.isFinite(declared) && declared >= 0 ? declared : undefined, requestId };
}
