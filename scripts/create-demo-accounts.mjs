// Creates demo logins in Supabase: 1 admin, 1 warehouse, 3 riders.
// Run from the project folder:   node scripts/create-demo-accounts.mjs
// Needs .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,
// and supabase/schema.sql already run in the Supabase SQL Editor.
// Safe to run again: existing logins are left as they are.

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";

// read .env.local
if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const DOMAIN = process.argv[2] || "tracerider.test";
const password = () => "Tr-" + crypto.randomBytes(6).toString("base64url");

const PEOPLE = [
  { email: `admin@${DOMAIN}`, name: "Demo Admin", role: "admin" },
  { email: `warehouse@${DOMAIN}`, name: "Imran (Desk 2)", role: "warehouse" },
  { email: `rider1@${DOMAIN}`, name: "Bilal Ahmed", role: "rider", rider: { id: "R-001", phone: "0300 1234471", bike: "Honda CD 70 · RIK-4471", licence: "Valid till Mar 2028" } },
  { email: `rider2@${DOMAIN}`, name: "Zeeshan Ali", role: "rider", rider: { id: "R-002", phone: "0301 1112209", bike: "Honda CD 70 · RIR-2209", licence: "Valid till Jan 2027" } },
  { email: `rider3@${DOMAIN}`, name: "Asad Mehmood", role: "rider", rider: { id: "R-003", phone: "0305 1118813", bike: "Honda CD 70 · RIR-8813", licence: "Valid till Feb 2029" } },
];

// check the schema exists
const check = await sb.from("staff").select("user_id").limit(1);
if (check.error) {
  console.error("Could not read the staff table. Run supabase/schema.sql in the Supabase SQL Editor first.\n", check.error.message);
  process.exit(1);
}

const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error("Could not list users:", listErr.message);
  process.exit(1);
}
const existing = new Map(list.users.map((u) => [u.email?.toLowerCase(), u]));

const out = [];
for (const p of PEOPLE) {
  let riderId = null;
  if (p.rider) {
    const { id, ...rest } = p.rider;
    const { error } = await sb.from("riders").upsert({ id, name: p.name, ...rest });
    if (error) {
      console.error(`Rider ${p.name}:`, error.message);
      continue;
    }
    riderId = id;
  }

  let userId;
  let pw = "(unchanged, login already existed)";
  const found = existing.get(p.email.toLowerCase());
  if (found) {
    userId = found.id;
  } else {
    pw = password();
    const { data, error } = await sb.auth.admin.createUser({ email: p.email, password: pw, email_confirm: true, user_metadata: { name: p.name } });
    if (error) {
      console.error(`Login ${p.email}:`, error.message);
      continue;
    }
    userId = data.user.id;
  }

  const { error: staffErr } = await sb.from("staff").upsert({ user_id: userId, role: p.role, rider_id: riderId, name: p.name });
  if (staffErr) {
    console.error(`Role for ${p.email}:`, staffErr.message);
    continue;
  }
  out.push({ role: p.role, name: p.name, email: p.email, password: pw });
}

console.log("\nSign in at https://trace-rider.vercel.app/login\n");
console.table(out);
console.log("Save these passwords now. They are not shown again.");
console.log("Change or remove these demo logins before real riders start (Admin › Staff & riders).\n");
