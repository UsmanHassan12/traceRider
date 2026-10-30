/**
 * Which Shopify orders become parcels. Pure functions, used by the webhook.
 *
 * SHOPIFY_CONFIRMED_TAG  tag an order must carry before it reaches the warehouse (default "order_confirmed").
 *                        Matching ignores case, spaces, hyphens and underscores, so "Order Confirmed" also counts.
 *                        Set it to "none" to accept every order.
 * ALLOWED_CITIES         comma-separated cities to deliver to (default "islamabad,rawalpindi").
 *                        Set it to "all" to accept every city.
 */

export interface AddressLike {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, "");

export function confirmedTag(): string {
  return (process.env.SHOPIFY_CONFIRMED_TAG ?? "order_confirmed").trim();
}

/** Shopify sends tags as one comma-separated string. */
export function hasConfirmedTag(tags: string | null | undefined, wanted = confirmedTag()): boolean {
  if (!wanted || wanted.toLowerCase() === "none") return true;
  const w = norm(wanted);
  return (tags ?? "")
    .split(",")
    .map((t) => norm(t))
    .some((t) => t === w);
}

export function allowedCities(): string[] {
  const raw = (process.env.ALLOWED_CITIES ?? "islamabad,rawalpindi").trim();
  if (raw.toLowerCase() === "all") return [];
  return raw
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

/** Returns the matching city name, or null when the address is outside the allowed cities. */
export function matchCity(a: AddressLike, cities = allowedCities()): string | null {
  if (cities.length === 0) return a.city?.trim() || "Any";
  const city = (a.city ?? "").toLowerCase();
  // 1. the city field itself
  for (const c of cities) if (city.includes(c)) return title(c);
  // 2. customers often type the city into the address lines or province instead
  const rest = [a.address1, a.address2, a.province].filter(Boolean).join(" ").toLowerCase();
  for (const c of cities) if (new RegExp(`\\b${c}\\b`).test(rest)) return title(c);
  return null;
}

const title = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());
