import type { Attempt, CustodyEvent, Deposit, Parcel, ParcelStatus, Review, Rider } from "./types";

/** Row shapes as stored in Supabase, and converters to the app's types. */

export interface ParcelRow {
  id: string;
  trk: string;
  shopify_order_id?: string | null;
  customer: string;
  phone: string;
  address: string;
  area: string;
  item: string;
  cod: number | string;
  otp: string;
  lat: number | null;
  lng: number | null;
  status: ParcelStatus;
  rider_id: string | null;
  created_at: string;
  ride_started_at: string | null;
  manual_scan: boolean;
  calls: number[] | null;
  attempt: Attempt | null;
  flags: string[] | null;
  review: Review | null;
  is_sample: boolean;
}

export interface EventRow {
  parcel_id: string;
  at: string;
  what: string;
  by: string;
  kind: string | null;
}

export interface RiderRow {
  id: string;
  name: string;
  phone: string;
  bike: string;
  licence: string;
  active?: boolean;
  is_sample?: boolean;
}

export interface DepositRow {
  rider_id: string;
  amount: number | string;
  at: string;
  by: string;
}

const ms = (s: string | null | undefined) => (s ? Date.parse(s) : undefined);
const iso = (n: number | undefined) => (n === undefined ? null : new Date(n).toISOString());

export function toParcel(r: ParcelRow, events: CustodyEvent[]): Parcel {
  return {
    id: r.id,
    trk: r.trk,
    customer: r.customer,
    phone: r.phone ?? "",
    address: r.address ?? "",
    area: r.area ?? "",
    item: r.item ?? "",
    cod: Number(r.cod) || 0,
    otp: r.otp,
    lat: r.lat,
    lng: r.lng,
    status: r.status,
    riderId: r.rider_id ?? undefined,
    createdAt: ms(r.created_at) ?? Date.now(),
    rideStartedAt: ms(r.ride_started_at),
    manualScan: r.manual_scan,
    calls: Array.isArray(r.calls) ? r.calls : [],
    attempt: r.attempt ?? undefined,
    flags: r.flags ?? [],
    review: r.review ?? undefined,
    isSample: r.is_sample,
    events,
  };
}

export function fromParcel(p: Parcel): ParcelRow {
  return {
    id: p.id,
    trk: p.trk,
    customer: p.customer,
    phone: p.phone,
    address: p.address,
    area: p.area,
    item: p.item,
    cod: p.cod,
    otp: p.otp,
    lat: p.lat,
    lng: p.lng,
    status: p.status,
    rider_id: p.riderId ?? null,
    created_at: new Date(p.createdAt).toISOString(),
    ride_started_at: iso(p.rideStartedAt),
    manual_scan: !!p.manualScan,
    calls: p.calls,
    attempt: p.attempt ?? null,
    flags: p.flags,
    review: p.review ?? null,
    is_sample: !!p.isSample,
  };
}

export const toEvent = (r: EventRow): CustodyEvent => ({
  at: Date.parse(r.at),
  what: r.what,
  by: r.by,
  kind: (r.kind as CustodyEvent["kind"]) ?? undefined,
});

export const fromEvent = (parcelId: string, e: CustodyEvent): EventRow => ({
  parcel_id: parcelId,
  at: new Date(e.at).toISOString(),
  what: e.what,
  by: e.by,
  kind: e.kind ?? null,
});

export const toRider = (r: RiderRow): Rider => ({ id: r.id, name: r.name, phone: r.phone, bike: r.bike, licence: r.licence });

export const toDeposit = (r: DepositRow): Deposit => ({ riderId: r.rider_id, amount: Number(r.amount) || 0, at: Date.parse(r.at), by: r.by });

export const fromDeposit = (d: Deposit): DepositRow => ({ rider_id: d.riderId, amount: d.amount, at: new Date(d.at).toISOString(), by: d.by });

/** Same-moment events are the same event (used to drop our own realtime echoes). */
export const sameEvent = (a: CustodyEvent, b: CustodyEvent) => a.at === b.at && a.what === b.what;
