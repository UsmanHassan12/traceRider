/**
 * Shopify Admin API (server only).
 * Uses the Dev Dashboard app's client ID + secret to get a 24-hour access token
 * (client credentials grant). The app must be installed on the store, belong to the same
 * Shopify organization, and have these scopes on its released version:
 *   read_orders, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders
 *
 * Env: SHOPIFY_STORE_DOMAIN (e.g. dwatson.myshopify.com), SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET
 * Optional: SHOPIFY_NOTIFY_CUSTOMER=true (send Shopify's shipping email), SHOPIFY_TRACKING_COMPANY
 */

const API_VERSION = "2026-07";

let cached: { token: string; until: number } | null = null;

export function shopifyConfigured() {
  return !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

function shopHost() {
  return (process.env.SHOPIFY_STORE_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

async function token(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  const res = await fetch(`https://${shopHost()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_CLIENT_ID ?? "",
      client_secret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify token request failed (${res.status}): ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { access_token: string; expires_in?: number };
  cached = { token: json.access_token, until: Date.now() + ((json.expires_in ?? 86399) - 120) * 1000 };
  return json.access_token;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${shopHost()}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": await token() },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] | string };
  if (!res.ok || json.errors) {
    const msg = Array.isArray(json.errors) ? json.errors.map((e) => e.message).join("; ") : String(json.errors ?? res.status);
    throw new Error(`Shopify API error: ${msg}`);
  }
  return json.data as T;
}

const ORDER_QUERY = `
query ($id: ID!) {
  order(id: $id) {
    displayFulfillmentStatus
    cancelledAt
    fulfillmentOrders(first: 20) { nodes { id status } }
  }
}`;

const FULFILL = `
mutation ($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id status }
    userErrors { field message }
  }
}`;

export type FulfillResult = { ok: true; status: "fulfilled" | "already" } | { ok: false; message: string };

/** Marks every open item of the order as fulfilled, with the parcel's tracking code. */
export async function fulfillOrder(shopifyOrderId: string, trackingNumber: string): Promise<FulfillResult> {
  try {
    const gid = shopifyOrderId.startsWith("gid://") ? shopifyOrderId : `gid://shopify/Order/${shopifyOrderId}`;
    type O = { order: { displayFulfillmentStatus: string; cancelledAt: string | null; fulfillmentOrders: { nodes: { id: string; status: string }[] } } | null };
    const data = await gql<O>(ORDER_QUERY, { id: gid });
    if (!data.order) return { ok: false, message: "Order not found in Shopify." };
    if (data.order.cancelledAt) return { ok: false, message: "Order is cancelled in Shopify." };
    const open = data.order.fulfillmentOrders.nodes.filter((n) => n.status === "OPEN" || n.status === "IN_PROGRESS");
    if (open.length === 0) {
      return data.order.displayFulfillmentStatus === "FULFILLED"
        ? { ok: true, status: "already" }
        : { ok: false, message: `Nothing to fulfill (Shopify shows ${data.order.displayFulfillmentStatus.toLowerCase()}).` };
    }
    type F = { fulfillmentCreate: { fulfillment: { id: string } | null; userErrors: { message: string }[] } };
    const res = await gql<F>(FULFILL, {
      fulfillment: {
        lineItemsByFulfillmentOrder: open.map((n) => ({ fulfillmentOrderId: n.id })),
        notifyCustomer: process.env.SHOPIFY_NOTIFY_CUSTOMER === "true",
        trackingInfo: { company: process.env.SHOPIFY_TRACKING_COMPANY || "Rider Trace", number: trackingNumber },
      },
    });
    const errs = res.fulfillmentCreate.userErrors;
    if (errs.length) return { ok: false, message: errs.map((e) => e.message).join("; ") };
    return { ok: true, status: "fulfilled" };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
