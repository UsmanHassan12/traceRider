"use client";

import { useEffect, useState } from "react";
import { distanceM } from "./format";
import { DEMO } from "./rules";

/**
 * Live distance from the rider's phone to the customer's address.
 * In demo mode a slider value overrides GPS so the flow can be tried from anywhere.
 */
export function useDistance(lat: number, lng: number) {
  const [gps, setGps] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [demo, setDemo] = useState<number>(60);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("This phone has no GPS access in the browser.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGps(distanceM(pos.coords.latitude, pos.coords.longitude, lat, lng));
        setGpsError(null);
      },
      () => setGpsError("Location is off. Turn on location for this app."),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [lat, lng]);

  const value = DEMO ? demo : gps;
  return { distance: value, gps, gpsError, demo, setDemo, isDemo: DEMO };
}
