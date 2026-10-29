import { NextResponse } from "next/server";
import { adminClient, requireAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const bad = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

/** List every login with its role. */
export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return bad("Only admins can do this.", 403);
  const admin = adminClient();
  const [{ data: users, error: e1 }, { data: staff, error: e2 }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("staff").select("user_id, role, rider_id, name"),
  ]);
  if (e1 || e2) return bad((e1 ?? e2)!.message, 500);
  const byId = new Map((staff ?? []).map((s) => [s.user_id as string, s] as const));
  const list = users.users.map((u) => {
    const s = byId.get(u.id);
    return { userId: u.id, email: u.email ?? "", role: s?.role ?? null, riderId: s?.rider_id ?? null, name: s?.name ?? "" };
  });
  return NextResponse.json({ ok: true, staff: list });
}

interface CreateBody {
  email: string;
  password: string;
  role: "admin" | "warehouse" | "rider";
  name: string;
  riderId?: string; // link to an existing rider
  rider?: { phone?: string; bike?: string; licence?: string }; // create a new rider
}

/** Create a login (and a rider profile for rider logins). */
export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return bad("Only admins can do this.", 403);
  const body = (await req.json()) as CreateBody;
  if (!body.email || !body.password || body.password.length < 8) return bad("Enter an email and a password of at least 8 characters.");
  if (!["admin", "warehouse", "rider"].includes(body.role)) return bad("Pick a role.");
  if (!body.name?.trim()) return bad("Enter the person's name.");
  const admin = adminClient();

  let riderId: string | null = null;
  if (body.role === "rider") {
    if (body.riderId) {
      riderId = body.riderId;
    } else {
      const { data: existing } = await admin.from("riders").select("id").like("id", "R-%");
      const used = new Set((existing ?? []).map((r) => r.id as string));
      let n = used.size + 1;
      while (used.has(`R-${String(n).padStart(3, "0")}`)) n++;
      riderId = `R-${String(n).padStart(3, "0")}`;
      const { error } = await admin.from("riders").insert({
        id: riderId,
        name: body.name.trim(),
        phone: body.rider?.phone ?? "",
        bike: body.rider?.bike ?? "",
        licence: body.rider?.licence ?? "",
      });
      if (error) return bad(error.message, 500);
    }
  }

  const { data: created, error: e1 } = await admin.auth.admin.createUser({
    email: body.email.trim(),
    password: body.password,
    email_confirm: true,
    user_metadata: { name: body.name.trim() },
  });
  if (e1 || !created.user) return bad(e1?.message ?? "Could not create the login.", 400);

  const { error: e2 } = await admin.from("staff").insert({ user_id: created.user.id, role: body.role, rider_id: riderId, name: body.name.trim() });
  if (e2) {
    await admin.auth.admin.deleteUser(created.user.id);
    return bad(e2.message, 500);
  }
  return NextResponse.json({ ok: true, userId: created.user.id, riderId });
}

/** Remove a login. Rider history stays. */
export async function DELETE(req: Request) {
  const caller = await requireAdmin(req);
  if (!caller) return bad("Only admins can do this.", 403);
  const { userId } = (await req.json()) as { userId?: string };
  if (!userId) return bad("Missing user.");
  if (userId === caller.userId) return bad("You can't remove your own login.");
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
