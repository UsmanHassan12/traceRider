"use client";

import { useEffect, useMemo, useState } from "react";
import { planRoute, readBase, saveBase, type Point } from "./route";
import type { Parcel } from "./types";

/** Delivery order for the rider's open parcels (see planRoute). */
export function useRoute(parcels: Parcel[]) {
  const [base, setBase] = useState<Point | null>(null);

  useEffect(() => {
    const known = readBase();
    if (known) {
      setBase(known);
      return;
    }
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        saveBase(p);
        setBase(readBase() ?? p);
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 15000 }
    );
  }, []);

  const key = parcels.map((p) => p.id).sort().join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stops = useMemo(() => planRoute(parcels, base), [key, base]);
  const stopOf = useMemo(() => new Map(stops.map((s) => [s.parcel.id, s])), [stops]);
  return { stops, stopOf, hasBase: !!base };
}
