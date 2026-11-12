"use client";

import { useEffect, useState } from "react";
import { distanceM } from "./format";
import { DEMO } from "./rules";

export interface Here {
  lat: number;
  lng: number;
  acc: number; // accuracy in metres
}

/**
 * Watches the rider's phone location for the whole ride.
 * - `here` is the rider's own position, recorded on every delivery and return so the admin can
 *   see where the rider was, even when the order has no map pin.
 * - `distance` is metres from the customer's pin; null when there is no pin or no GPS fix.
 * In demo mode a slider value overrides the distance so the flow can be tried from anywhere.
 */
export function useDistance(lat: number | null, lng: number | null) {
  const [here, setHere] = useState<Here | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [demo, setDemo] = useState<number>(60);
  const noPin = lat === null || lng === null;

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("This phone has no GPS access in the browser.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) });
        setGpsError(null);
      },
      () => setGpsError("Location is off. Turn on location for this app in the phone settings."),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const gps = here && !noPin ? distanceM(here.lat, here.lng, lat!, lng!) : null;
  const value = noPin ? null : DEMO ? demo : gps;
  return { distance: value, gps, here, gpsError, demo, setDemo, isDemo: DEMO && !noPin, noPin };
}
