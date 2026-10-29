"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useStore } from "@/lib/store";
import { sb } from "@/lib/supabase";
import type { Role } from "@/lib/types";

interface Login {
  userId: string;
  email: string;
  role: Role | null;
  riderId: string | null;
  name: string;
}

async function api(method: "GET" | "POST" | "DELETE", body?: unknown) {
  const { data } = await sb().auth.getSession();
  const res = await fetch("/api/admin/staff", {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ ok: false, message: `Server error (${res.status}).` }));
  return json as { ok: boolean; message?: string; staff?: Login[] };
}

export default function StaffPage() {
  const { state, me, loadSample, clearSample } = useStore();
  const toast = useToast();
  const [logins, setLogins] = useState<Login[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Login | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "rider" as Role, phone: "", bike: "", licence: "", riderId: "" });

  const refresh = useCallback(async () => {
    const r = await api("GET");
    if (r.ok && r.staff) {
      setLogins(r.staff);
      setLoadErr(null);
    } else setLoadErr(r.message ?? "Could not load logins.");
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await api("POST", {
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role,
      riderId: form.role === "rider" && form.riderId ? form.riderId : undefined,
      rider: form.role === "rider" && !form.riderId ? { phone: form.phone, bike: form.bike, licence: form.licence } : undefined,
    });
    setBusy(false);
    if (!r.ok) return toast(r.message ?? "Could not create the login.", "bad");
    toast(`Login created for ${form.name}. Share the email and password with them.`, "good");
    setForm({ name: "", email: "", password: "", role: form.role, phone: "", bike: "", licence: "", riderId: "" });
    void refresh();
  }

  async function remove(l: Login) {
    const r = await api("DELETE", { userId: l.userId });
    setRemoving(null);
    if (!r.ok) return toast(r.message ?? "Could not remove the login.", "bad");
    toast(`Removed ${l.email}.`);
    void refresh();
  }

  const linked = new Set((logins ?? []).map((l) => l.riderId).filter(Boolean));
  const unlinkedRiders = state.riders.filter((r) => !linked.has(r.id));
  const hasSample = state.parcels.some((p) => p.isSample);

  return (
    <main style={{ padding: "26px 32px 48px", display: "flex", flexDirection: "column", gap: 22, maxWidth: 1100 }}>
      <div>
        <h1 style={{ fontSize: 26 }}>Staff &amp; riders</h1>
        <div className="small muted">Every person signs in at /login with the email and password you set here.</div>
      </div>

      <div className="row wrap" style={{ gap: 16, alignItems: "flex-start" }}>
        <section className="card pad-lg stack" style={{ flex: "3 1 460px", minWidth: 0 }}>
          <h2>Logins</h2>
          {loadErr && <div className="small" style={{ color: "var(--red)" }}>{loadErr}</div>}
          {!logins && !loadErr && <div className="small muted">Loading…</div>}
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 520 }}>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Rider</th><th /></tr></thead>
              <tbody>
                {(logins ?? []).map((l) => (
                  <tr key={l.userId}>
                    <td><b>{l.name || "—"}</b></td>
                    <td className="small">{l.email}</td>
                    <td>{l.role ? <span className={`pill ${l.role === "admin" ? "bad" : l.role === "warehouse" ? "warn" : "info"}`}>{l.role}</span> : <span className="xs muted">No role</span>}</td>
                    <td className="mono xs">{l.riderId ?? ""}</td>
                    <td style={{ textAlign: "right" }}>
                      {l.userId !== me?.userId && (
                        <button type="button" className="btn sm ghost" onClick={() => setRemoving(l)} aria-label={`Remove ${l.email}`}>
                          <Icon name="x" size={14} /> Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <form onSubmit={create} className="card pad-lg stack" style={{ flex: "2 1 320px", minWidth: 0 }}>
          <h2>Add a login</h2>
          <div className="field">
            <label htmlFor="f-role">Role</label>
            <select id="f-role" className="input" value={form.role} onChange={set("role")}>
              <option value="rider">Rider</option>
              <option value="warehouse">Warehouse desk</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="field"><label htmlFor="f-name">Full name</label><input id="f-name" className="input" required value={form.name} onChange={set("name")} /></div>
          <div className="field"><label htmlFor="f-email">Email (used to sign in)</label><input id="f-email" className="input" type="email" required value={form.email} onChange={set("email")} /></div>
          <div className="field"><label htmlFor="f-pw">Password (8+ characters)</label><input id="f-pw" className="input" type="text" minLength={8} required value={form.password} onChange={set("password")} /></div>
          {form.role === "rider" && (
            <>
              {unlinkedRiders.length > 0 && (
                <div className="field">
                  <label htmlFor="f-rid">Rider profile</label>
                  <select id="f-rid" className="input" value={form.riderId} onChange={set("riderId")}>
                    <option value="">Create a new rider</option>
                    {unlinkedRiders.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.id})</option>)}
                  </select>
                </div>
              )}
              {!form.riderId && (
                <>
                  <div className="field"><label htmlFor="f-phone">Mobile number</label><input id="f-phone" className="input" type="tel" value={form.phone} onChange={set("phone")} placeholder="0300 1234567" /></div>
                  <div className="field"><label htmlFor="f-bike">Bike and number plate</label><input id="f-bike" className="input" value={form.bike} onChange={set("bike")} placeholder="Honda CD 70 · ABC-123" /></div>
                  <div className="field"><label htmlFor="f-lic">Driving licence</label><input id="f-lic" className="input" value={form.licence} onChange={set("licence")} placeholder="Valid till Mar 2028" /></div>
                </>
              )}
            </>
          )}
          <button type="submit" className="btn navy" disabled={busy}>{busy ? "Creating…" : "Create login"}</button>
        </form>
      </div>

      <section className="card pad-lg stack">
        <h2>Sample data</h2>
        <div className="small muted">
          Load a full sample day (6 sample riders, about 230 parcels) to show the dashboard before real orders come in. Sample records are marked and can be
          removed in one click. Real Shopify orders are never touched.
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn" disabled={busy || hasSample} onClick={async () => { setBusy(true); const r = await loadSample(); setBusy(false); toast(r.message, r.ok ? "good" : "bad"); }}>
            Load sample day
          </button>
          <button type="button" className="btn danger-outline" disabled={busy || !hasSample} onClick={async () => { setBusy(true); const r = await clearSample(); setBusy(false); toast(r.message, r.ok ? "good" : "bad"); }}>
            Remove sample data
          </button>
        </div>
      </section>

      {removing && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setRemoving(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rm-title">
            <h2 id="rm-title">Remove {removing.email}?</h2>
            <div className="small muted">They won&apos;t be able to sign in any more. Their past deliveries and returns stay in the records.</div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setRemoving(null)}>Cancel</button>
              <button type="button" className="btn red" onClick={() => remove(removing)}>Remove login</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
