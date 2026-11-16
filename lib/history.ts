import { toDeposit, toParcel, type DepositRow, type ParcelRow } from "./db";
import { sb } from "./supabase";
import type { Deposit, Parcel } from "./types";

/**
 * Reads straight from the database for date ranges older than the 10 days the app keeps loaded
 * (returns history, CSV export, cash on a past date). Custody logs are not included.
 */

const PAGE = 1000;

/** Start of a yyyy-mm-dd day in local time, in ms. */
export const dayStart = (d: string) => new Date(`${d}T00:00:00`).getTime();
/** End of a yyyy-mm-dd day in local time, in ms. */
export const dayEnd = (d: string) => new Date(`${d}T23:59:59.999`).getTime();
/** yyyy-mm-dd for a time, in local time. */
export const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// attempt.at is stored as milliseconds; every date since 2001 has 13 digits, so comparing the
// text works the same as comparing the numbers.
const msText = (t: number) => String(Math.round(t)).padStart(13, "0");

type Query = { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

async function all<T>(build: () => Query): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

/** Parcels closed (delivered or returned) between two times, optionally only one outcome. */
export async function closedBetween(from: number, to: number, outcome?: "delivered" | "returned"): Promise<Parcel[]> {
  const rows = await all<ParcelRow>(() => {
    let q = sb().from("parcels").select("*").not("attempt", "is", null).gte("attempt->>at", msText(from)).lte("attempt->>at", msText(to));
    if (outcome) q = q.eq("attempt->>outcome", outcome);
    return q.order("id") as unknown as Query;
  });
  return rows.map((r) => toParcel(r, []));
}

/** Parcels that arrived from Shopify between two times. */
export async function createdBetween(from: number, to: number): Promise<Parcel[]> {
  const rows = await all<ParcelRow>(() =>
    sb().from("parcels").select("*").gte("created_at", new Date(from).toISOString()).lte("created_at", new Date(to).toISOString()).order("id") as unknown as Query
  );
  return rows.map((r) => toParcel(r, []));
}

/** Every COD delivery up to a time (for cash balances on a past date). */
export async function deliveredUpTo(to: number): Promise<Parcel[]> {
  const rows = await all<ParcelRow>(() =>
    sb().from("parcels").select("*").eq("status", "delivered").gt("cod", 0).lte("attempt->>at", msText(to)).order("id") as unknown as Query
  );
  return rows.map((r) => toParcel(r, []));
}

/** Every cash handover up to a time. */
export async function depositsUpTo(to: number): Promise<Deposit[]> {
  const rows = await all<DepositRow>(() => sb().from("deposits").select("*").lte("at", new Date(to).toISOString()).order("at") as unknown as Query);
  return rows.map(toDeposit);
}

/** Saves rows as a CSV file the browser downloads. */
export function downloadCsv(rows: (string | number)[][], name: string) {
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
