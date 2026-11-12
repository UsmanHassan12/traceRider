import { Icon } from "./Icon";

/** Branded placeholder while the session and data load. */
export function LoadingScreen({ label = "Loading parcels…" }: { label?: string }) {
  return (
    <div aria-busy="true" role="status" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "var(--ground)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <span className="loading-mark">
          <Icon name="box" size={30} stroke={2.2} />
        </span>
        <span className="small muted">{label}</span>
      </div>
    </div>
  );
}
