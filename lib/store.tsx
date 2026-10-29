"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, Parcel, ReturnReason, Review } from "./types";
import { makeParcel, seedState } from "./seed";
import { flagsFor, RULES } from "./rules";

/**
 * Front-end store. Everything lives in this browser's localStorage so the prototype works
 * without a server. Open the warehouse and rider screens in two tabs of the same browser and
 * they stay in sync. Swap these actions for API calls when the backend is ready.
 */

const KEY = "trace-rider.v1";
const DESK = "Imran · Desk 2";

type Result = { ok: true; message: string; parcel?: Parcel } | { ok: false; message: string };

interface Store {
  ready: boolean;
  state: AppState;
  reset: () => void;
  login: (phone: string) => Result;
  logout: () => void;
  syncShopify: () => number;
  printLabel: (id: string) => void;
  handover: (riderId: string, trks: string[]) => void;
  receiveReturn: (trk: string) => Result;
  startRide: (code: string, riderId: string, manual: boolean) => Result;
  logCall: (id: string) => void;
  deliver: (id: string, input: { otp: string; distanceM: number; photo?: string }) => Result;
  markReturn: (id: string, input: { reason: ReturnReason; distanceM: number; photo?: string }) => Result & { flags?: string[] };
  deposit: (riderId: string, amount: number) => void;
  saveReview: (id: string, review: Omit<Review, "at">) => void;
}

const Ctx = createContext<Store | null>(null);

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s && s.version === 1 && Array.isArray(s.parcels)) return s;
    }
  } catch {
    /* storage blocked or corrupt: fall back to sample data */
  }
  return seedState();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => ({ version: 1, parcels: [], riders: [], deposits: [], currentRiderId: null, nextOrder: 1 }));
  const [ready, setReady] = useState(false);
  const ref = useRef(state);

  useEffect(() => {
    const s = load();
    ref.current = s;
    setState(s);
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        const s2 = JSON.parse(e.newValue) as AppState;
        ref.current = s2;
        setState(s2);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((next: AppState) => {
    ref.current = next;
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* quota or private mode: keep working in memory */
    }
  }, []);

  /** Clone, mutate, commit. Returns whatever the mutator returns. */
  const mutate = useCallback(
    <T,>(fn: (draft: AppState) => T): T => {
      const draft = structuredClone(ref.current);
      const out = fn(draft);
      commit(draft);
      return out;
    },
    [commit]
  );

  const riderName = (s: AppState, id?: string) => s.riders.find((r) => r.id === id)?.name ?? "Rider";

  const store = useMemo<Store>(
    () => ({
      ready,
      state,
      reset: () => commit({ ...seedState(), currentRiderId: ref.current.currentRiderId }),
      login: (phone) => {
        const digits = phone.replace(/\D/g, "").replace(/^92/, "").replace(/^0/, "");
        const r = ref.current.riders.find((x) => x.phone === digits);
        if (!r) return { ok: false, message: "This number is not registered as a rider. Ask the warehouse to add you." };
        mutate((s) => {
          s.currentRiderId = r.id;
        });
        return { ok: true, message: `Welcome, ${r.name}` };
      },
      logout: () =>
        mutate((s) => {
          s.currentRiderId = null;
        }),
      syncShopify: () =>
        mutate((s) => {
          const k = 1 + Math.floor(Math.random() * 3);
          const rand = Math.random;
          for (let i = 0; i < k; i++) s.parcels.push(makeParcel(s.nextOrder++, Date.now(), rand));
          return k;
        }),
      printLabel: (id) =>
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id);
          if (!p || p.status !== "new") return;
          p.status = "labeled";
          p.events.push({ at: Date.now(), what: "Label printed and pasted on box", by: DESK });
        }),
      handover: (riderId, trks) =>
        mutate((s) => {
          const name = riderName(s, riderId);
          s.parcels.forEach((p) => {
            if (trks.includes(p.trk) && p.status === "labeled") {
              p.status = "handed";
              p.riderId = riderId;
              p.events.push({ at: Date.now(), what: `Handed to ${name}`, by: DESK });
            }
          });
        }),
      receiveReturn: (trk) => {
        const p0 = ref.current.parcels.find((x) => x.trk.toUpperCase() === trk.toUpperCase());
        if (!p0) return { ok: false, message: `No parcel has code ${trk}.` };
        if (p0.status !== "returned") return { ok: false, message: `${p0.trk} is not waiting to be checked in.` };
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === p0.id)!;
          p.status = "received";
          p.events.push({ at: Date.now(), what: "Return checked in at warehouse", by: DESK });
        });
        return { ok: true, message: `Return ${p0.trk} checked in.` };
      },
      startRide: (code, riderId, manual) => {
        const s0 = ref.current;
        const p0 = s0.parcels.find((x) => x.trk.toUpperCase() === code.trim().toUpperCase());
        if (!p0) return { ok: false, message: `No parcel has code ${code}. Check the label.` };
        if (p0.status === "new" || p0.status === "labeled") return { ok: false, message: `${p0.trk} has not been handed to a rider yet.` };
        if (p0.riderId !== riderId) return { ok: false, message: `${p0.trk} was handed to ${riderName(s0, p0.riderId)}, not you. Ask the warehouse to reassign it.` };
        if (p0.status === "out") return { ok: true, message: `${p0.trk} is already on a live ride.`, parcel: p0 };
        if (p0.status !== "handed") return { ok: false, message: `${p0.trk} is already closed.` };
        const parcel = mutate((s) => {
          const p = s.parcels.find((x) => x.id === p0.id)!;
          p.status = "out";
          p.rideStartedAt = Date.now();
          p.manualScan = manual;
          p.events.push({ at: Date.now(), what: manual ? "Code typed in (no QR scan), ride started" : "QR scanned, ride started", by: riderName(s, riderId) });
          return p;
        });
        return { ok: true, message: "Parcel matched", parcel };
      },
      logCall: (id) =>
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id);
          if (!p) return;
          p.calls.push(Date.now());
          p.events.push({ at: Date.now(), what: `Called customer from app (call ${p.calls.length})`, by: riderName(s, p.riderId) });
        }),
      deliver: (id, input) => {
        const p0 = ref.current.parcels.find((x) => x.id === id);
        if (!p0 || p0.status !== "out") return { ok: false, message: "This ride is not live." };
        if (input.otp.trim() !== p0.otp) return { ok: false, message: "That code does not match. Ask the customer for the 4-digit code from their SMS." };
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id)!;
          p.status = "delivered";
          p.attempt = { outcome: "delivered", at: Date.now(), calls: p.calls.length, distanceM: input.distanceM, photo: input.photo, otpOk: true, manualScan: !!p.manualScan };
          p.flags = flagsFor(p.attempt);
          p.events.push({ at: Date.now(), what: "Delivered, customer code verified", by: riderName(s, p.riderId), kind: "good" });
        });
        return { ok: true, message: "Delivered. Shopify order will be marked fulfilled." };
      },
      markReturn: (id, input) => {
        const p0 = ref.current.parcels.find((x) => x.id === id);
        if (!p0 || p0.status !== "out") return { ok: false, message: "This ride is not live." };
        const attempt = {
          outcome: "returned" as const,
          at: Date.now(),
          reason: input.reason,
          calls: p0.calls.length,
          distanceM: input.distanceM,
          photo: input.photo,
          manualScan: !!p0.manualScan,
        };
        const flags = flagsFor(attempt);
        if (RULES.mode === "block" && flags.some((f) => !f.startsWith("Code typed"))) {
          return { ok: false, message: "Some checks are not met yet.", flags };
        }
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id)!;
          p.status = "returned";
          p.attempt = attempt;
          p.flags = flags;
          p.events.push({ at: Date.now(), what: `Marked returned: ${input.reason}`, by: riderName(s, p.riderId), kind: "bad" });
          p.events.push({ at: Date.now(), what: "SMS sent to customer: did the rider visit?", by: "System" });
        });
        return { ok: true, message: flags.length ? "Return saved and flagged for review." : "Return saved. Bring the parcel back to the warehouse.", flags };
      },
      deposit: (riderId, amount) =>
        mutate((s) => {
          s.deposits.push({ riderId, amount, at: Date.now(), by: DESK });
        }),
      saveReview: (id, review) =>
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id);
          if (!p) return;
          p.review = { ...review, at: Date.now() };
          const label = review.decision === "rider" ? "rider fault" : review.decision === "customer" ? "customer fault" : "needs more checking";
          p.events.push({ at: Date.now(), what: `Admin review: ${label}${review.note ? ` · "${review.note}"` : ""}`, by: "Admin" });
        }),
    }),
    [ready, state, commit, mutate]
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

/** Cash a rider is holding: COD delivered today minus today's deposits. */
export function cashInHand(s: AppState, riderId: string) {
  const today = new Date().toDateString();
  const collected = s.parcels
    .filter((p) => p.riderId === riderId && p.status === "delivered" && p.attempt && new Date(p.attempt.at).toDateString() === today)
    .reduce((sum, p) => sum + p.cod, 0);
  const deposited = s.deposits.filter((d) => d.riderId === riderId && new Date(d.at).toDateString() === today).reduce((sum, d) => sum + d.amount, 0);
  return { collected, deposited, inHand: Math.max(0, collected - deposited) };
}
