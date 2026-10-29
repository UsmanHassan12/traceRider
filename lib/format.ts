import type { ParcelStatus } from "./types";

export const pkr = (n: number) => "Rs " + Math.round(n).toLocaleString("en-PK");

export const time = (t: number) =>
  new Date(t).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" });

export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const isToday = (t?: number) => t !== undefined && dayKey(t) === dayKey(Date.now());

export const minsSince = (t: number) => Math.max(0, Math.round((Date.now() - t) / 60000));

export const ago = (t: number) => {
  const m = minsSince(t);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
};

export const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const STATUS: Record<ParcelStatus, { label: string; tone: "info" | "warn" | "good" | "bad" }> = {
  new: { label: "Needs label", tone: "info" },
  labeled: { label: "Ready for handover", tone: "info" },
  handed: { label: "Not scanned by rider", tone: "warn" },
  out: { label: "Out for delivery", tone: "info" },
  delivered: { label: "Delivered", tone: "good" },
  returned: { label: "Returned, coming back", tone: "bad" },
  received: { label: "Return checked in", tone: "bad" },
};

/** Distance in metres between two lat/lng points. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const fmtDistance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
