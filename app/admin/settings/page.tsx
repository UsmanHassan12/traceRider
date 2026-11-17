"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { callApi } from "@/lib/api";

interface Settings {
  enabled: boolean;
  emails: string[];
  time: string;
  lastSentDay?: string;
  lastResult?: string;
}
type Res = { ok: boolean; message?: string; settings?: Settings; mailReady?: boolean };

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

export default function SettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mailReady, setMailReady] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [time, setTime] = useState("22:00");
  const [last, setLast] = useState<string | undefined>();
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    callApi<Res>("/api/admin/settings", "GET").then((r) => {
      setLoading(false);
      if (!r.ok || !r.settings) return setError(r.message ?? "Could not load settings.");
      setEnabled(r.settings.enabled);
      setEmails(r.settings.emails);
      setTime(r.settings.time);
      setLast(r.settings.lastResult);
      setMailReady(!!r.mailReady);
    });
  }, []);

  function addDraft(): string[] {
    const parts = draft.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return emails;
    const bad = parts.find((e) => !validEmail(e));
    if (bad) {
      toast(`Not a valid email: ${bad}`, "bad");
      return emails;
    }
    const next = Array.from(new Set([...emails, ...parts]));
    setEmails(next);
    setDraft("");
    setDirty(true);
    return next;
  }

  async function save() {
    const list = addDraft();
    setBusy("save");
    const r = await callApi<Res>("/api/admin/settings", "POST", { action: "save", enabled, emails: list, time });
    setBusy(null);
    toast(r.message ?? (r.ok ? "Saved." : "Could not save."), r.ok ? "good" : "bad");
    if (r.ok) setDirty(false);
  }

  async function test() {
    const list = addDraft();
    setBusy("test");
    const r = await callApi<Res>("/api/admin/settings", "POST", { action: "test", emails: list, time });
    setBusy(null);
    toast(r.message ?? (r.ok ? "Test email sent." : "Could not send."), r.ok ? "good" : "bad");
  }

  const covers = time >= "12:00" ? "that day so far" : "the whole previous day";

  return (
    <main className="adm-main">
      <div>
        <h1 style={{ fontSize: 26 }}>Settings</h1>
        <div className="small muted">How you receive updates from Rider Trace.</div>
      </div>

      <section className="card pad-lg stack" style={{ maxWidth: 720 }}>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--navy-soft)", color: "var(--navy)", display: "grid", placeItems: "center" }}>
              <Icon name="mail" size={20} />
            </span>
            <div>
              <h2>Receive updates · daily report</h2>
              <div className="xs muted">One email a day: orders, delivered, returned, reattempts, flagged returns, cash per rider. All orders attached as a CSV.</div>
            </div>
          </div>
          <button
            type="button"
            aria-pressed={enabled}
            onClick={() => { setEnabled(!enabled); setDirty(true); }}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: 0, cursor: "pointer", fontWeight: 600, fontSize: 13, color: enabled ? "var(--green)" : "var(--muted)" }}
          >
            {enabled ? "On" : "Off"}
            <span style={{ width: 44, height: 26, borderRadius: 99, background: enabled ? "var(--green)" : "#cfd6e0", position: "relative", display: "block" }}>
              <span style={{ position: "absolute", top: 3, left: enabled ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </span>
          </button>
        </div>

        {error && <div className="small" style={{ color: "var(--red)" }}>{error}</div>}
        {!loading && !mailReady && (
          <div className="card small" style={{ background: "var(--amber-soft)", border: "1px solid #f1d7ae", color: "var(--amber-ink)" }}>
            Email sending is not set up on the server yet. Add <span className="mono">RESEND_API_KEY</span> in Vercel (free account at resend.com) and redeploy. You can still save these settings now.
          </div>
        )}

        <div className="field">
          <label htmlFor="rp-email">Send to</label>
          <div className="row wrap" style={{ gap: 6, border: "1px solid var(--line-2)", borderRadius: 10, padding: 6, background: "#fff" }}>
            {emails.map((e) => (
              <span key={e} className="pill info" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {e}
                <button type="button" aria-label={`Remove ${e}`} onClick={() => { setEmails(emails.filter((x) => x !== e)); setDirty(true); }} style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", padding: 0, display: "grid" }}>
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
            <input
              id="rp-email"
              type="email"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addDraft(); } }}
              onBlur={() => draft.trim() && addDraft()}
              placeholder={emails.length ? "Add another email" : "name@company.com"}
              style={{ flex: "1 1 180px", minWidth: 0, border: 0, outline: 0, font: "inherit", minHeight: 32, background: "transparent" }}
            />
          </div>
          <div className="xs muted">Press Enter after each address. Up to 20.</div>
        </div>

        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="rp-time">Send every day at (Pakistan time)</label>
          <input id="rp-time" type="time" className="input" value={time} step={900} onChange={(e) => { setTime(e.target.value || "22:00"); setDirty(true); }} />
          <div className="xs muted">Arrives within 15 minutes of {fmtTime(time)} and covers {covers}.</div>
        </div>

        {last && <div className="xs muted">Last automatic send: {last}</div>}

        <div className="row wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={test} disabled={loading || busy !== null || (!emails.length && !draft.trim())}>
            {busy === "test" ? "Sending…" : "Send a test now"}
          </button>
          <button type="button" className="btn navy" onClick={save} disabled={loading || busy !== null}>
            {busy === "save" ? "Saving…" : dirty ? "Save settings" : "Saved"}
          </button>
        </div>
      </section>
    </main>
  );
}
