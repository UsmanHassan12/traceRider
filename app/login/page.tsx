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
    <div className="login">
      <aside className="login-brand">
        <div className="row" style={{ gap: 12 }}>
          <span style={{ width: 52, height: 52, borderRadius: 14, background: "#fff", display: "grid", placeItems: "center", color: "var(--red)", flex: "none" }}>
            <Icon name="box" size={28} stroke={2.2} />
          </span>
          <span>
            <span style={{ display: "block", fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>Rider Trace</span>
            <span style={{ display: "block", color: "#f7d9d9", fontSize: 13 }}>Parcel custody, from Shopify order to doorstep</span>
          </span>
        </div>
        <div className="login-pitch">
          <h1 style={{ color: "#fff", fontSize: 30, lineHeight: 1.2 }}>Every parcel, with one person at a time.</h1>
          <ul>
            <li><Icon name="printer" size={18} /> Warehouse prints a QR label and hands boxes to a named rider</li>
            <li><Icon name="scan" size={18} /> Riders scan to start, and prove every delivery or return</li>
            <li><Icon name="grid" size={18} /> Admins see daily results and review suspicious returns</li>
          </ul>
        </div>
        <div className="xs" style={{ color: "#f7d9d9" }}>Islamabad · Rawalpindi</div>
      </aside>

      <main className="login-panel">
        {ready && session && !me ? (
          <div className="login-card">
            <h2>No role on this login yet</h2>
            <div className="muted">You are signed in as {session.user.email}. Ask the admin to add this login on the Staff page.</div>
            <button type="button" className="btn" onClick={() => signOut()}>Sign out</button>
          </div>
        ) : (
          <form onSubmit={submit} className="login-card">
            <div>
              <h2 style={{ fontSize: 22 }}>Sign in</h2>
              <div className="small muted" style={{ marginTop: 4 }}>Riders, warehouse staff and admins all sign in here.</div>
            </div>
            <div className="field">
              <label htmlFor="em">Email</label>
              <input id="em" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ fontSize: 16 }} />
            </div>
            <div className="field">
              <label htmlFor="pw">Password</label>
              <input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={{ fontSize: 16 }} />
            </div>
            {msg && (
              <div role="alert" className="small row" style={{ gap: 8, color: "var(--red)", background: "var(--red-tint)", border: "1px solid #f0c9c6", borderRadius: 10, padding: "8px 12px" }}>
                <Icon name="info" size={16} /> {msg}
              </div>
            )}
            <button type="submit" className="btn red xl" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            <div className="xs muted" style={{ textAlign: "center" }}>Forgot your password? Ask the admin to reset it.</div>
          </form>
        )}
      </main>
    </div>
  );
}
