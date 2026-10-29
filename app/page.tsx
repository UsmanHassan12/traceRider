import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

const ROLES: { href: string; title: string; text: string; icon: IconName }[] = [
  { href: "/rider", title: "Rider app", text: "Scan parcels, run rides, mark delivered or returned with proof.", icon: "scan" },
  { href: "/warehouse", title: "Warehouse desk", text: "Print QR labels, hand parcels to riders, check returns back in.", icon: "printer" },
  { href: "/admin", title: "Admin dashboard", text: "Daily tracking by rider and review of flagged returns.", icon: "grid" },
];

export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 16px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="row" style={{ gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: "var(--red)", display: "grid", placeItems: "center", color: "#fff" }}>
          <Icon name="box" size={24} />
        </div>
        <div>
          <h1>Rider Trace</h1>
          <div className="muted small">Parcel custody from Shopify order to doorstep</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {ROLES.map((r) => (
          <Link key={r.href} href={r.href} className="card" style={{ textDecoration: "none", color: "var(--ink)", display: "flex", flexDirection: "column", gap: 10, padding: 18 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--navy-soft)", color: "var(--navy)", display: "grid", placeItems: "center" }}>
              <Icon name={r.icon} />
            </span>
            <h2>{r.title}</h2>
            <span className="muted small">{r.text}</span>
          </Link>
        ))}
      </div>
      <p className="muted xs">
        Prototype: data is sample data stored in this browser. Open the warehouse and rider screens in two tabs of the same browser to see them update together.
      </p>
    </main>
  );
}
