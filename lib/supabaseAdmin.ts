import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client with the service role (secret) key.
 * Bypasses row level security, so it is only used inside API routes, never in the browser.
 */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Returns the signed-in staff member from the request's bearer token when their role is allowed, or null. */
export async function requireRole(req: Request, roles: string[]): Promise<{ userId: string; role: string; name: string } | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: staff } = await admin.from("staff").select("role,name").eq("user_id", data.user.id).maybeSingle();
  if (!staff || !roles.includes(staff.role)) return null;
  return { userId: data.user.id, role: staff.role, name: staff.name || data.user.email || "Staff" };
}

/** Returns the signed-in admin's user id from the request's bearer token, or null. */
export async function requireAdmin(req: Request): Promise<{ userId: string } | null> {
  return requireRole(req, ["admin"]);
}
