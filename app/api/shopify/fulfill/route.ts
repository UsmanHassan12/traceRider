import { NextResponse } from "next/server";
import { fulfillOrder, shopifyConfigured } from "@/lib/shopify";
import { adminClient, requireRole } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Marks Shopify orders as fulfilled. Called by the warehouse right after a handover,
 * and by the admin's Retry button. Body: { ids: string[] } (parcel ids such as "#1047").
 */
export async function POST(req: Request) {
  const who = await requireRole(req, ["admin", "warehouse"]);
  if (!who) return NextResponse.json({ ok: false, message: "Only warehouse or admin logins can do this." }, { status: 403 });
  if (!shopifyConfigured()) {
    return NextResponse.json({ ok: false, message: "Shopify fulfillment is not set up yet (SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET)." }, { status: 200 });
  }

  const { ids } = (await req.json().catch(() => ({}))) as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: false, message: "No parcels given." }, { status: 400 });

  const db = adminClient();
  const { data: rows, error } = await db.from("parcels").select("id,trk,shopify_order_id,shopify_sync").in("id", ids.slice(0, 100));
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  const results: { id: string; ok: boolean; message: string }[] = [];
  for (const p of rows ?? []) {
    if (!p.shopify_order_id) {
      results.push({ id: p.id, ok: true, message: "Not a Shopify order (test or sample)." });
      continue;
    }
    if (p.shopify_sync === "fulfilled") {
      results.push({ id: p.id, ok: true, message: "Already fulfilled." });
      continue;
    }
    const r = await fulfillOrder(p.shopify_order_id, p.trk);
    const now = new Date().toISOString();
    if (r.ok) {
      await db.from("parcels").update({ shopify_sync: "fulfilled", shopify_synced_at: now }).eq("id", p.id);
      await db.from("parcel_events").insert({ parcel_id: p.id, at: now, what: r.status === "already" ? "Shopify order was already fulfilled" : "Shopify order marked fulfilled", by: who.name, kind: "good" });
      results.push({ id: p.id, ok: true, message: "Fulfilled in Shopify." });
    } else {
      await db.from("parcels").update({ shopify_sync: `error: ${r.message}`.slice(0, 300), shopify_synced_at: now }).eq("id", p.id);
      await db.from("parcel_events").insert({ parcel_id: p.id, at: now, what: `Shopify fulfillment failed: ${r.message}`.slice(0, 300), by: "System", kind: "bad" });
      results.push({ id: p.id, ok: false, message: r.message });
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ ok: failed === 0, results, message: failed ? `${failed} order${failed > 1 ? "s" : ""} could not be fulfilled in Shopify.` : "Shopify updated." });
}
