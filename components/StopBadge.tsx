/** Round number showing a parcel's place in the delivery order; "?" when it has no map pin. */
export function StopBadge({ n }: { n: number | null }) {
  return (
    <span
      aria-label={n ? `Stop ${n}` : "No map pin"}
      title={n ? `Stop ${n}` : "No map pin: ask the customer for directions"}
      style={{ flex: "none", width: 30, height: 30, borderRadius: "50%", background: n ? "var(--navy)" : "var(--ground)", color: n ? "#fff" : "var(--muted)", fontWeight: 700, fontSize: 13, display: "grid", placeItems: "center", marginRight: 10 }}
    >
      {n ?? "?"}
    </span>
  );
}
