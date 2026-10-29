"use client";

import { useStore } from "./store";

export function useRider() {
  const store = useStore();
  const rider = store.state.riders.find((r) => r.id === store.me?.riderId) ?? null;
  return { ...store, rider };
}
