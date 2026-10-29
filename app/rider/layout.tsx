"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RoleGate } from "@/components/RoleGate";

const TABS = [
  { href: "/rider", label: "Home", icon: "home" as const },
  { href: "/rider/parcels", label: "Parcels", icon: "box" as const },
  { href: "/rider/scan", label: "Scan", icon: "scan" as const, fab: true },
  { href: "/rider/cash", label: "Cash", icon: "cash" as const },
  { href: "/rider/profile", label: "Profile", icon: "user" as const },
];

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const showTabs = !path.startsWith("/rider/scan") && !path.startsWith("/rider/ride") && path !== "/rider/login";

  return (
    <RoleGate roles={["rider"]}>
      <div className="phone">
        {children}
        {showTabs && (
          <nav className="tabbar" aria-label="Rider">
            {TABS.map((t) =>
              t.fab ? (
                <Link key={t.href} href={t.href} aria-label="Scan parcel" style={{ color: "var(--navy)", fontWeight: 600 }}>
                  <span className="scan-fab">
                    <Icon name={t.icon} size={24} stroke={2.2} />
                  </span>
                  {t.label}
                </Link>
              ) : (
                <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>
                  <Icon name={t.icon} size={22} />
                  {t.label}
                </Link>
              )
            )}
          </nav>
        )}
      </div>
    </RoleGate>
  );
}
