"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon } from "@/components/Icon";
import { useStore } from "@/lib/store";

const TABS = [
  { href: "/rider", label: "Home", icon: "home" as const },
  { href: "/rider/parcels", label: "Parcels", icon: "box" as const },
  { href: "/rider/scan", label: "Scan", icon: "scan" as const, fab: true },
  { href: "/rider/cash", label: "Cash", icon: "cash" as const },
  { href: "/rider/profile", label: "Profile", icon: "user" as const },
];

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  const { ready, state } = useStore();
  const path = usePathname();
  const router = useRouter();
  const onLogin = path === "/rider/login";
  const showTabs = !onLogin && !path.startsWith("/rider/scan") && !path.startsWith("/rider/ride");

  useEffect(() => {
    if (ready && !state.currentRiderId && !onLogin) router.replace("/rider/login");
  }, [ready, state.currentRiderId, onLogin, router]);

  if (!ready || (!state.currentRiderId && !onLogin)) {
    return <div className="phone" aria-busy="true" />;
  }

  return (
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
  );
}
