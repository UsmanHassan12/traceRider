"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { DEMO } from "@/lib/rules";
import { useStore } from "@/lib/store";

export default function RiderLogin() {
  const { login, state } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const [lang, setLang] = useState<"en" | "ur">("en");

  function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return toast("Enter your 10-digit mobile number, e.g. 300 1234567.", "bad");
    setSent(true);
    setTimeout(() => boxes.current[0]?.focus(), 50);
    toast(DEMO ? "Demo: any 6 digits will work." : "Code sent by SMS.");
  }

  function verify(e: React.FormEvent) {
    e.preventDefault();
    if (code.join("").length !== 6) return toast("Enter all 6 digits of the SMS code.", "bad");
    const r = login(phone);
    if (!r.ok) return toast(r.message, "bad");
    toast(r.message, "good");
    router.replace("/rider");
  }

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = d;
    setCode(next);
    if (d && i < 5) boxes.current[i + 1]?.focus();
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#fff" }}>
      <div style={{ background: "var(--red)", color: "#fff", padding: "56px 24px 36px", borderRadius: "0 0 28px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "#fff", display: "grid", placeItems: "center", color: "var(--red)" }}>
          <Icon name="box" size={30} stroke={2.2} />
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>Rider Trace</div>
          <div style={{ color: "#f7d9d9", marginTop: 4 }}>{lang === "en" ? "Sign in to start your shift" : "شفٹ شروع کرنے کے لیے سائن ان کریں"}</div>
        </div>
      </div>

      <form onSubmit={sent ? verify : sendCode} style={{ padding: "28px 24px", display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
        <div className="field">
          <label htmlFor="lg-phone">Mobile number</label>
          <div className="row" style={{ border: "1px solid var(--line-2)", borderRadius: 12, overflow: "hidden", gap: 0 }}>
            <span style={{ padding: "0 12px", minHeight: 52, display: "flex", alignItems: "center", background: "var(--ground)", borderRight: "1px solid var(--line-2)", fontWeight: 600 }}>+92</span>
            <input id="lg-phone" type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="300 1234567" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", fontSize: 16, padding: "0 12px", minHeight: 52 }} />
            {sent && <span className="xs" style={{ padding: "0 12px", color: "var(--green)", fontWeight: 600 }}>Sent</span>}
          </div>
        </div>

        {sent && (
          <div className="field">
            <label htmlFor="otp-0">Enter the 6-digit code sent by SMS</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 }}>
              {code.map((d, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  ref={(el) => {
                    boxes.current[i] = el;
                  }}
                  aria-label={`Digit ${i + 1}`}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !code[i] && i > 0) boxes.current[i - 1]?.focus();
                  }}
                  className="input"
                  style={{ textAlign: "center", fontSize: 22, fontWeight: 600, height: 54, padding: 0 }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{ alignItems: "flex-start", gap: 12, background: "var(--ground)", borderRadius: 12, padding: "12px 14px" }}>
          <Icon name="camera" size={22} color="var(--navy)" />
          <div className="small" style={{ color: "var(--ink-2)" }}>
            After this you take a quick selfie. It confirms the right rider is on shift and is kept with today&apos;s custody log.
          </div>
        </div>

        {DEMO && (
          <details className="xs muted">
            <summary style={{ cursor: "pointer" }}>Demo rider numbers</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {state.riders.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setPhone(r.phone)} style={{ border: 0, background: "none", padding: 0, color: "var(--navy)", textDecoration: "underline", cursor: "pointer" }}>
                    {r.phone}
                  </button>{" "}
                  {r.name}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <button type="submit" className="btn red xl">
            {sent ? "Verify and start shift" : "Send code"}
          </button>
          <div className="xs muted" style={{ textAlign: "center" }}>
            This phone is registered to you. Signing in on a new phone needs warehouse approval.
          </div>
          <div className="row" style={{ justifyContent: "center", gap: 6 }}>
            <button type="button" className="chip" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
            <button type="button" className="chip" aria-pressed={lang === "ur"} onClick={() => setLang("ur")} lang="ur">اردو</button>
          </div>
        </div>
      </form>
    </div>
  );
}
