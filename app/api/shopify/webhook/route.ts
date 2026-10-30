import crypto from "crypto";
import { NextResponse } from "next/server";
import { confirmedTag, hasConfirmedTag, matchCity } from "@/lib/orderRules";
import { adminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Shopify order webhooks → parcels waiting for a label.
 * Create three webhooks in Shopify admin › Settings › Notifications › Webhooks, all JSON, all to
 *   https://<your-app>.vercel.app/api/shopify/webhook
 *   • Order creation   • Order update   • Order cancellation
 * An order becomes a parcel only when it carries the confirmed tag (SHOPIFY_CONFIRMED_TAG)
 * and ships to an allowed city (ALLOWED_CITIES). Most stores add that tag after the COD
 * confirmation call, so the "Order update" webhook is the one that usually brings the order in.
 */

interface ShopifyAddress {
  name?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  latitude?: number | null;
  longitude?: number | null;
}
interface ShopifyOrder {
  id: number;
  name?: string;
  order_number?: number;
  created_at?: string;
  cancelled_at?: string | null;
  financial_status?: string;
  fulfillment_status?: string | null;
  tags?: string;
  total_price?: string;
  total_outstanding?: string;
  phone?: string;
  customer?: { first_name?: string; last_name?: string; phone?: string };
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  line_items?: { title: string; quantity: number }[];
}

const LETTERS = "KPBMTWCRDHQZLSVFJ";
const skip = (reason: string, id?: string) => NextResponse.json({ ok: true, skipped: reason, id });

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("SHOPIFY_WEBHOOK_SECRET is not set", { status: 500 });

  const given = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return new NextResponse("Invalid signature", { status: 401 });

  const topic = req.headers.get("x-shopify-topic") ?? "orders/create";
  if (!["orders/create", "orders/updated", "orders/cancelled"].includes(topic)) return skip(`topic ${topic}`);

  const order = JSON.parse(raw) as ShopifyOrder;
  const num = order.order_number ?? order.id;
  const id = order.name || `#${num}`;
  const admin = adminClient();

  // ── cancelled in Shopify ──
  if (topic === "orders/cancelled" || order.cancelled_at) {
    const { data: existing } = await admin.from("parcels").select("id,status").eq("id", id).maybeSingle();
    if (!existing) return skip("cancelled, not in app", id);
    if (existing.status === "new" || existing.status === "labeled") {
      await admin.from("parcels").delete().eq("id", id);
      return NextResponse.json({ ok: true, removed: id });
    }
    await admin.from("parcel_events").insert({ parcel_id: id, at: new Date().toISOString(), what: "Order cancelled in Shopify. Bring the parcel back.", by: "Shopify", kind: "bad" });
    return NextResponse.json({ ok: true, noted: "cancelled after handover", id });
  }

  // ── only confirmed orders for allowed cities ──
  if (!hasConfirmedTag(order.tags)) return skip(`no "${confirmedTag()}" tag`, id);
  if (order.fulfillment_status === "fulfilled") return skip("already fulfilled in Shopify", id);
  const sa = order.shipping_address ?? order.billing_address ?? {};
  const city = matchCity(sa);
  if (!city) return skip(`city "${sa.city ?? ""}" not served`, id);

  // order/updated fires many times; only the first one creates the parcel
  const { data: already } = await admin.from("parcels").select("id").eq("id", id).maybeSingle();
  if (already) return skip("already in app", id);

  const customerName = sa.name || [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") || "Customer";
  const paid = order.financial_status === "paid";
  const cod = paid ? 0 : Number(order.total_outstanding ?? order.total_price ?? 0) || 0;
  const lat = typeof sa.latitude === "number" ? sa.latitude : null;
  const lng = typeof sa.longitude === "number" ? sa.longitude : null;

  const row = {
    id,
    trk: `RT${num}-${LETTERS[crypto.randomInt(LETTERS.length)]}${crypto.randomInt(10)}`,
    shopify_order_id: String(order.id),
    customer: customerName,
    phone: sa.phone || order.phone || order.customer?.phone || "",
    address: [sa.address1, sa.address2, sa.city].filter(Boolean).join(", "),
    area: sa.address2?.trim() ? `${sa.address2.trim()}, ${city}` : city,
    item: (order.line_items ?? []).map((li) => (li.quantity > 1 ? `${li.title} x${li.quantity}` : li.title)).join(", ").slice(0, 240),
    cod,
    otp: String(crypto.randomInt(1000, 10000)),
    lat,
    lng,
    status: "new",
    created_at: order.created_at ?? new Date().toISOString(),
  };

  const { error } = await admin.from("parcels").insert(row);
  if (error) {
    if (error.code === "23505") return skip("already in app", id); // two webhooks at the same moment
    return new NextResponse(error.message, { status: 500 });
  }
  await admin.from("parcel_events").insert({ parcel_id: id, at: new Date().toISOString(), what: "Confirmed order received from Shopify", by: "Shopify" });
  return NextResponse.json({ ok: true, id });
}
