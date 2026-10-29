"use client";

import { fmtDistance } from "@/lib/format";

export function DemoDistance({ value, onChange, gps }: { value: number; onChange: (v: number) => void; gps: number | null }) {
  return (
    <div className="field" style={{ background: "var(--amber-soft)", borderRadius: 10, padding: "10px 12px" }}>
      <label htmlFor="demo-dist" className="xs" style={{ color: "var(--amber-ink)" }}>
        Demo only: rider is <b>{fmtDistance(value)}</b> from the address{gps !== null ? ` (real GPS says ${fmtDistance(gps)})` : ""}
      </label>
      <input id="demo-dist" type="range" min={0} max={3000} step={10} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ accentColor: "var(--red)" }} />
    </div>
  );
}
