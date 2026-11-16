"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { StopBadge } from "@/components/StopBadge";
import { isReady } from "@/lib/custody";
import { ago, pkr } from "@/lib/format";
import { routeLink } from "@/lib/route";
import { useRider } from "@/lib/useRider";
import { useRoute } from "@/lib/useRoute";

/** Deliveries the rider has started and not yet closed. */
export default function LiveRides() {
  const { state, rider } = useRider();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const mine = rider ? state.parcels.filter((p) => p.riderId === rider.id) : [];
  // same order as Home, so stop numbers match
  const route = useRoute(mine.filter((p) => isReady(p) || p.status === "out"));
  if (!rider) return null;

  const order = (id: string) => route.stopOf.get(id)?.stop ?? 999;
  const live = mine.filter((p) => p.status === "out").sort((a, b) => order(a.id) - order(b.id));
  const ready = mine.filter(isReady).length;
  const mapLink = routeLink(route.stops.filter((s) => s.parcel.status === "out"));

  return (
    <>
      <div className="topbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
        <div className="row between" style={{ alignItems: "baseline" }}>
          <h1>Live rides</h1>
          <span className="small muted">{live.length} on the way</span>
        </div>
        <div className="xs muted">{route.hasBase ? "Nearest first, farthest last" : "In the order you started them"}</div>
      </div>

      <div className="phone-main">
        {mapLink && live.length > 1 && (
          <a href={mapLink} target="_blank" rel="noreferrer" className="btn" style={{ minHeight: 48 }}>
            <Icon name="map" size={18} /> Open route in Google Maps
          </a>
        )}
        {live.length === 0 && (
          <div className="empty">
            No live rides.
            {ready > 0 ? ` ${ready} parcel${ready > 1 ? "s are" : " is"} ready. Start a delivery from Home.` : " Pick up parcels at the warehouse first."}
          </div>
        )}
        {live.length === 0 && <Link href="/rider" className="btn navy">Go to my parcels</Link>}
        {live.map((p) => (
          <Link key={p.id} href={`/rider/ride/${encodeURIComponent(p.trk)}`} className="card" style={{ textDecoration: "none", color: "var(--ink)", display: "flex", flexDirection: "column", gap: 8, borderRadius: 14 }}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <StopBadge n={route.stopOf.get(p.id)?.stop ?? null} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{p.customer}</div>
                <div className="small muted">{p.address}</div>
              </div>
              <span className="pill info">Live · {ago(p.rideStartedAt ?? Date.now())}</span>
            </div>
            <div className="row between">
              <span className="mono xs muted">{p.trk}</span>
              <span className="num" style={{ fontWeight: 700 }}>{p.cod ? pkr(p.cod) : "Prepaid"}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
