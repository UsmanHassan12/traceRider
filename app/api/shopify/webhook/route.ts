import crypto from "crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Shopify "Order creation" webhook → creates a parcel waiting for a label.
 * Shopify admin › Settings › Notifications › Webhooks › Create webhook:
 *   Event: Order creation · Format: JSON · URL: https://<your-app>.vercel.app/api/shopify/webhook
 * Put the signing secret shown on that page in SHOPIFY_WEBHOOK_SECRET.
 */

interface ShopifyAddress {
  name?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
}
interface ShopifyOrder {
  id: number;
  name?: string;
  order_number?: number;
  created_at?: string;
  financial_status?: string;
  total_price?: string;
  total_outstanding?: string;
  phone?: string;
  customer?: { first_name?: string; last_name?: string; phone?: string };
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  line_items?: { title: string; quantity: number }[];
}

const LETTERS = "KPBMTWCRDHQZLSVFJ";

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("SHOPIFY_WEBHOOK_SECRET is not set", { status: 500 });

  const given = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return new NextResponse("Invalid signature", { status: 401 });

  const topic = req.headers.get("x-shopify-topic");
  if (topic && topic !== "orders/create") return NextResponse.json({ ok: true, ignored: topic });

  const order = JSON.parse(raw) as ShopifyOrder;
  const sa = order.shipping_address ?? order.billing_address ?? {};
  const customerName = sa.name || [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") || "Customer";
  const num = order.order_number ?? order.id;
  const id = order.name || `#${num}`;
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
    area: sa.address2 || sa.city || "",
    item: (order.line_items ?? []).map((li) => (li.quantity > 1 ? `${li.title} x${li.quantity}` : li.title)).join(", ").slice(0, 240),
    cod,
    otp: String(crypto.randomInt(1000, 10000)),
    lat,
    lng,
    status: "new",
    created_at: order.created_at ?? new Date().toISOString(),
  };

  const admin = adminClient();
  const { error } = await admin.from("parcels").insert(row);
  if (error) {
    // 23505 = already exists (Shopify retries webhooks); that's fine
    if (error.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    return new NextResponse(error.message, { status: 500 });
  }
  await admin.from("parcel_events").insert({ parcel_id: id, at: new Date().toISOString(), what: "Order synced from Shopify", by: "Shopify" });
  return NextResponse.json({ ok: true, id });
}
