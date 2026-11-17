import type { Attempt, CustodyEvent, Deposit, Parcel, ParcelStatus, Review, Rider, Reattempt } from "./types";

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
  attempts?: Reattempt[] | null;
  flags: string[] | null;
  review: Review | null;
  is_sample: boolean;
  shopify_sync?: string | null;
  archived_from?: ParcelStatus | null;
  archived_at?: string | null;
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
  licence_expiry?: string | null;
  active?: boolean;
  is_sample?: boolean;
}

export interface DepositRow {
  id?: number;
  rider_id: string;
  amount: number | string;
  at: string;
  by: string;
  request_id?: string | null;
  declared?: number | string | null;
  status?: string | null;
  rider_note?: string | null;
  confirmed_at?: string | null;
  resolved_by?: string | null;
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
    attempts: r.attempts?.length ? r.attempts : undefined,
    flags: r.flags ?? [],
    review: r.review ?? undefined,
    isSample: r.is_sample,
    shopifyOrderId: r.shopify_order_id ?? undefined,
    shopifySync: r.shopify_sync ?? undefined,
    archivedFrom: r.archived_from ?? undefined,
    archivedAt: ms(r.archived_at),
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
    // only sent once there is a reattempt, so databases without update 007 keep working
    ...(p.attempts?.length ? { attempts: p.attempts } : {}),
    flags: p.flags,
    review: p.review ?? null,
    is_sample: !!p.isSample,
    shopify_order_id: p.shopifyOrderId ?? null,
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

export const toRider = (r: RiderRow): Rider => ({ id: r.id, name: r.name, phone: r.phone, bike: r.bike, licence: r.licence, licenceExpiry: r.licence_expiry ?? undefined });

export const toDeposit = (r: DepositRow): Deposit => ({
  id: r.id,
  riderId: r.rider_id,
  amount: Number(r.amount) || 0,
  at: Date.parse(r.at),
  by: r.by,
  requestId: r.request_id ?? undefined,
  declared: r.declared === null || r.declared === undefined ? undefined : Number(r.declared),
  status: (r.status as Deposit["status"]) ?? "confirmed",
  riderNote: r.rider_note ?? undefined,
  confirmedAt: r.confirmed_at ? Date.parse(r.confirmed_at) : undefined,
  resolvedBy: r.resolved_by ?? undefined,
});

/** New deposit row. Handover fields are left out when unset, so older databases still accept it. */
export const fromDeposit = (d: Deposit): DepositRow => {
  const row: DepositRow = { rider_id: d.riderId, amount: d.amount, at: new Date(d.at).toISOString(), by: d.by };
  if (d.requestId) row.request_id = d.requestId;
  if (d.declared !== undefined) row.declared = d.declared;
  if (d.status) row.status = d.status;
  if (d.confirmedAt) row.confirmed_at = new Date(d.confirmedAt).toISOString();
  return row;
};

/** Same-moment events are the same event (used to drop our own realtime echoes). */
export const sameEvent = (a: CustodyEvent, b: CustodyEvent) => a.at === b.at && a.what === b.what;
