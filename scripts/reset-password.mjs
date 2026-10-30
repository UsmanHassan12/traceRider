// Sets a new random password for one login and prints it.
// Run from the project folder:
//   node scripts/reset-password.mjs admin@tracerider.test
// Optional: choose the password yourself (8+ characters):
//   node scripts/reset-password.mjs admin@tracerider.test "MyNewPass123"

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";

if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const chosen = process.argv[3];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!email) {
    console.error('Usage: node scripts/reset-password.mjs <email> ["new password"]');
    process.exitCode = 1;
    return;
  }
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exitCode = 1;
    return;
  }
  if (chosen && chosen.length < 8) {
    console.error("The password must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error("Could not list users:", error.message);
    process.exitCode = 1;
    return;
  }
  const user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    console.error(`No login found for ${email}.`);
    process.exitCode = 1;
    return;
  }

  const password = chosen || "Tr-" + crypto.randomBytes(9).toString("base64url");
  const { error: upErr } = await sb.auth.admin.updateUserById(user.id, { password });
  if (upErr) {
    console.error("Could not update the password:", upErr.message);
    process.exitCode = 1;
    return;
  }

  console.log(`\nNew password for ${email}:\n\n    ${password}\n`);
  console.log("Save it now. It is not shown again. Sign in at https://trace-rider.vercel.app/login\n");
}

await main();
