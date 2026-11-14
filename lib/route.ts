import { distanceM } from "./format";
import type { Parcel } from "./types";

export interface Point {
  lat: number;
  lng: number;
}

/** Warehouse location from NEXT_PUBLIC_WAREHOUSE_LAT / NEXT_PUBLIC_WAREHOUSE_LNG, if set. */
export const WAREHOUSE: Point | null = (() => {
  const lat = Number(process.env.NEXT_PUBLIC_WAREHOUSE_LAT);
  const lng = Number(process.env.NEXT_PUBLIC_WAREHOUSE_LNG);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
})();

export interface Stop {
  parcel: Parcel;
  stop: number | null; // 1-based delivery order; null when the parcel has no map pin
  fromBase: number | null; // straight-line metres from the warehouse (or the rider's start point)
}

/**
 * Delivery order: nearest drop first, farthest last.
 *
 * Start at the warehouse and keep hopping to the nearest drop not yet planned. That keeps stops
 * that are close together next to each other (no zig-zagging) while the route works outwards from
 * base. Distances are straight lines, not roads, so it is a good order, not a
 * perfect one. Parcels without a map pin go at the end, unnumbered.
 */
export function planRoute(parcels: Parcel[], base: Point | null): Stop[] {
  const pinned = parcels.filter((p) => p.lat !== null && p.lng !== null);
  const noPin = parcels.filter((p) => p.lat === null || p.lng === null);
  if (!base) {
    // nothing to measure from: keep the order they came in, still numbered
    return [
      ...pinned.map((p, i) => ({ parcel: p, stop: i + 1, fromBase: null })),
      ...noPin.map((p) => ({ parcel: p, stop: null, fromBase: null })),
    ];
  }

  const left = [...pinned];
  const chain: Parcel[] = [];
  let at: Point = base;
  while (left.length) {
    let best = 0;
    let bestD = Infinity;
    left.forEach((p, i) => {
      const d = distanceM(at.lat, at.lng, p.lat!, p.lng!);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const next = left.splice(best, 1)[0];
    chain.push(next);
    at = { lat: next.lat!, lng: next.lng! };
  }

  return [
    ...chain.map((p, i) => ({ parcel: p, stop: i + 1, fromBase: distanceM(base.lat, base.lng, p.lat!, p.lng!) })),
    ...noPin.map((p) => ({ parcel: p, stop: null, fromBase: null })),
  ];
}

/** Google Maps directions through the stops in order (free link, no API key). Mobile allows up to 9 waypoints. */
export function routeLink(stops: Stop[]): string | null {
  const pts = stops.filter((s) => s.stop !== null).map((s) => `${s.parcel.lat},${s.parcel.lng}`);
  if (!pts.length) return null;
  const route = pts.slice(0, 10);
  const destination = route[route.length - 1];
  const waypoints = route.slice(0, -1).join("|");
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;
}

const BASE_KEY = () => `rider-trace.base.${new Date().toDateString()}`;

/**
 * Where the route is measured from: the warehouse when it is set, otherwise the rider's first
 * GPS fix of the day (normally taken at the warehouse). Saved for the day so the order does not
 * reshuffle as the rider moves around.
 */
export function readBase(): Point | null {
  if (WAREHOUSE) return WAREHOUSE;
  try {
    const raw = localStorage.getItem(BASE_KEY());
    return raw ? (JSON.parse(raw) as Point) : null;
  } catch {
    return null;
  }
}
export function saveBase(p: Point) {
  if (WAREHOUSE) return;
  try {
    if (!localStorage.getItem(BASE_KEY())) localStorage.setItem(BASE_KEY(), JSON.stringify(p));
  } catch {
    /* private mode: the route falls back to arrival order */
  }
}
