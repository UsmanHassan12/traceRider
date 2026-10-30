"use client";

import { sb } from "./supabase";

/** Calls one of the app's own API routes with the signed-in user's token. */
export async function callApi<T = { ok: boolean; message?: string }>(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> {
  const { data } = await sb().auth.getSession();
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json().catch(() => ({ ok: false, message: `Server error (${res.status}).` }))) as T;
}

export type FulfillResponse = { ok: boolean; message?: string; results?: { id: string; ok: boolean; message: string }[] };

/** Ask the server to mark these parcels' Shopify orders as fulfilled. */
export const fulfillInShopify = (ids: string[]) => callApi<FulfillResponse>("/api/shopify/fulfill", "POST", { ids });
