"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { SetupNeeded } from "@/components/RoleGate";
import { homeFor, useStore } from "@/lib/store";

export default function LoginPage() {
  const { configured, ready, session, me, signIn, signOut } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ready && me) router.replace(homeFor(me.role));
  }, [ready, me, router]);

  if (!configured) return <SetupNeeded />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await signIn(email, password);
    setBusy(false);
    if (!r.ok) setMsg(r.message);
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#fff", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ background: "var(--red)", color: "#fff", padding: "56px 24px 36px", borderRadius: "0 0 28px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "#fff", display: "grid", placeItems: "center", color: "var(--red)" }}>
          <Icon name="box" size={30} stroke={2.2} />
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>Rider Trace</div>
          <div style={{ color: "#f7d9d9", marginTop: 4 }}>Sign in to start your shift</div>
        </div>
      </div>

      {ready && session && !me ? (
        <div style={{ padding: "28px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <h2>No role on this login yet</h2>
          <div className="muted">
            You are signed in as {session.user.email}. Ask the admin to add this login on the Staff page.
          </div>
          <button type="button" className="btn" onClick={() => signOut()}>Sign out</button>
        </div>
      ) : (
        <form onSubmit={submit} style={{ padding: "28px 24px", display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
          <div className="field">
            <label htmlFor="em">Email</label>
            <input id="em" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ fontSize: 16 }} />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={{ fontSize: 16 }} />
          </div>
          {msg && <div className="small" style={{ color: "var(--red)" }}>{msg}</div>}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <button type="submit" className="btn red xl" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            <div className="xs muted" style={{ textAlign: "center" }}>Riders, warehouse staff and admins all sign in here. The admin creates logins on the Staff page.</div>
          </div>
        </form>
      )}
    </div>
  );
}
