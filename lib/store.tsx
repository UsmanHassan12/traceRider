"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fromDeposit, fromEvent, fromParcel, sameEvent, toDeposit, toEvent, toParcel, toRider, type DepositRow, type EventRow, type ParcelRow, type RiderRow } from "./db";
import { flagsFor, NON_BLOCKING, RULES } from "./rules";
import { makeParcel, seedState } from "./seed";
import { configured, sb } from "./supabase";
import type { AppState, Me, Parcel, ReturnReason, Review, Role } from "./types";

/**
 * App store backed by Supabase.
 * Actions update the screen at once (optimistic) and write to the database in the background.
 * Changes made on other devices arrive through Supabase Realtime.
 */

type Result = { ok: true; message: string; parcel?: Parcel } | { ok: false; message: string };

interface Store {
  configured: boolean;
  /** Auth checked and, when signed in, data loaded. */
  ready: boolean;
  session: Session | null;
  me: Me | null;
  state: AppState;
  error: string | null;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<Result>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  addTestOrder: () => void;
  printLabel: (id: string) => void;
  printLabels: (ids: string[]) => void;
  /** Returns the ids of the parcels that were handed over. */
  handover: (riderId: string, trks: string[]) => string[];
  adminSetOutcome: (id: string, outcome: "delivered" | "returned", reason?: ReturnReason, note?: string) => Result;
  receiveReturn: (trk: string) => Result;
  startRide: (code: string, riderId: string, manual: boolean) => Result;
  logCall: (id: string) => void;
  deliver: (id: string, input: { otp: string; distanceM: number; photo?: string }) => Result;
  markReturn: (id: string, input: { reason: ReturnReason; distanceM: number; photo?: string }) => Result & { flags?: string[] };
  deposit: (riderId: string, amount: number) => void;
  saveReview: (id: string, review: Omit<Review, "at">) => void;
  loadSample: () => Promise<Result>;
  clearSample: () => Promise<Result>;
}

const Ctx = createContext<Store | null>(null);
const EMPTY: AppState = { version: 1, parcels: [], riders: [], deposits: [], currentRiderId: null, nextOrder: 1 };
const OPEN = "new,labeled,handed,out,returned";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
async function fetchAll<T>(query: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function chunked<T>(rows: T[], size: number, fn: (part: T[]) => PromiseLike<{ error: { message: string } | null }>) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await fn(rows.slice(i, i + size));
    if (error) throw new Error(error.message);
  }
}

export const homeFor = (role: Role) => (role === "rider" ? "/rider" : role === "warehouse" ? "/warehouse" : "/admin");

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY);
  const ref = useRef<AppState>(EMPTY);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const meRef = useRef<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback((s: AppState) => {
    ref.current = s;
    setState(s);
  }, []);

  const actor = () => meRef.current?.name || meRef.current?.email || "Staff";

  // ── auth ──
  useEffect(() => {
    if (!configured) {
      setAuthChecked(true);
      return;
    }
    const client = sb();
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // ── loading ──
  const loadAll = useCallback(
    async (riderId: string | null) => {
      const client = sb();
      const since = new Date(Date.now() - 10 * 864e5).toISOString();
      const [riderRes, parcelRows, eventRows, depositRes] = await Promise.all([
        client.from("riders").select("*").order("name"),
        fetchAll<ParcelRow>((f, t) => client.from("parcels").select("*").or(`created_at.gte."${since}",status.in.(${OPEN})`).order("created_at").range(f, t)),
        fetchAll<EventRow>((f, t) => client.from("parcel_events").select("parcel_id,at,what,by,kind").gte("at", since).order("at").range(f, t)),
        client.from("deposits").select("rider_id,amount,at,by").gte("at", since).order("at"),
      ]);
      if (riderRes.error) throw new Error(riderRes.error.message);
      if (depositRes.error) throw new Error(depositRes.error.message);
      const byParcel = new Map<string, ReturnType<typeof toEvent>[]>();
      for (const e of eventRows) {
        const list = byParcel.get(e.parcel_id) ?? [];
        list.push(toEvent(e));
        byParcel.set(e.parcel_id, list);
      }
      set({
        version: 1,
        riders: ((riderRes.data ?? []) as RiderRow[]).filter((r) => r.active !== false).map(toRider),
        parcels: parcelRows.map((r) => toParcel(r, byParcel.get(r.id) ?? [])),
        deposits: ((depositRes.data ?? []) as DepositRow[]).map(toDeposit),
        currentRiderId: riderId,
        nextOrder: 1,
      });
    },
    [set]
  );

  const userId = session?.user.id;
  const email = session?.user.email ?? "";
  useEffect(() => {
    if (!userId) {
      meRef.current = null;
      setMe(null);
      set(EMPTY);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const { data, error: e } = await sb().from("staff").select("role, rider_id, name").eq("user_id", userId).maybeSingle();
        if (cancelled) return;
        if (e) throw new Error(e.message);
        if (!data) {
          meRef.current = null;
          setMe(null);
          setLoaded(true);
          return;
        }
        const m: Me = { userId, email, role: data.role as Role, riderId: data.rider_id, name: data.name };
        meRef.current = m;
        setMe(m);
        await loadAll(m.riderId);
      } catch (err) {
        if (!cancelled) setError(`Could not load data: ${(err as Error).message}`);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, email, loadAll, set]);

  const reload = useCallback(async () => {
    try {
      await loadAll(meRef.current?.riderId ?? null);
    } catch (err) {
      setError(`Could not load data: ${(err as Error).message}`);
    }
  }, [loadAll]);

  // ── realtime ──
  useEffect(() => {
    if (!userId || !loaded || !meRef.current) return;
    const client = sb();
    const reloadDeposits = async () => {
      const since = new Date(Date.now() - 10 * 864e5).toISOString();
      const { data } = await client.from("deposits").select("rider_id,amount,at,by").gte("at", since).order("at");
      if (data) set({ ...ref.current, deposits: (data as DepositRow[]).map(toDeposit) });
    };
    const reloadRiders = async () => {
      const { data } = await client.from("riders").select("*").order("name");
      if (data) set({ ...ref.current, riders: (data as RiderRow[]).filter((r) => r.active !== false).map(toRider) });
    };
    const channel = client
      .channel("rider-trace-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "parcels" }, (payload) => {
        const cur = ref.current;
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          set({ ...cur, parcels: cur.parcels.filter((p) => p.id !== id) });
          return;
        }
        const row = payload.new as ParcelRow;
        const existing = cur.parcels.find((p) => p.id === row.id);
        const p = toParcel(row, existing?.events ?? []);
        set({ ...cur, parcels: existing ? cur.parcels.map((x) => (x.id === row.id ? p : x)) : [...cur.parcels, p] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "parcel_events" }, (payload) => {
        const r = payload.new as EventRow;
        const ev = toEvent(r);
        const cur = ref.current;
        set({
          ...cur,
          parcels: cur.parcels.map((p) =>
            p.id !== r.parcel_id || p.events.some((e) => sameEvent(e, ev)) ? p : { ...p, events: [...p.events, ev].sort((a, b) => a.at - b.at) }
          ),
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deposits" }, () => void reloadDeposits())
      .on("postgres_changes", { event: "*", schema: "public", table: "riders" }, () => void reloadRiders())
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [userId, loaded, set]);

  // ── writes ──
  const persist = useCallback(
    async (before: AppState, after: AppState) => {
      const client = sb();
      const prev = new Map(before.parcels.map((p) => [p.id, p] as const));
      const inserts: ParcelRow[] = [];
      const updates: ParcelRow[] = [];
      const events: EventRow[] = [];
      for (const p of after.parcels) {
        const o = prev.get(p.id);
        if (!o) {
          inserts.push(fromParcel(p));
          events.push(...p.events.map((e) => fromEvent(p.id, e)));
          continue;
        }
        if (JSON.stringify(fromParcel(p)) !== JSON.stringify(fromParcel(o))) updates.push(fromParcel(p));
        if (p.events.length > o.events.length) events.push(...p.events.slice(o.events.length).map((e) => fromEvent(p.id, e)));
      }
      const deposits = after.deposits.slice(before.deposits.length).map(fromDeposit);
      try {
        if (inserts.length) {
          const { error: e } = await client.from("parcels").insert(inserts);
          if (e) throw new Error(e.message);
        }
        for (const row of updates) {
          const { id, ...rest } = row;
          const { error: e } = await client.from("parcels").update(rest).eq("id", id);
          if (e) throw new Error(e.message);
        }
        if (events.length) {
          const { error: e } = await client.from("parcel_events").insert(events);
          if (e) throw new Error(e.message);
        }
        if (deposits.length) {
          const { error: e } = await client.from("deposits").insert(deposits);
          if (e) throw new Error(e.message);
        }
      } catch (err) {
        setError(`Not saved: ${(err as Error).message}. Reloading the latest data.`);
        await reload();
      }
    },
    [reload]
  );

  /** Clone, change, show at once, then save in the background. */
  const mutate = useCallback(
    <T,>(fn: (draft: AppState) => T): T => {
      const before = ref.current;
      const draft = structuredClone(before);
      const out = fn(draft);
      set(draft);
      void persist(before, draft);
      return out;
    },
    [set, persist]
  );

  const riderName = (s: AppState, id?: string) => s.riders.find((r) => r.id === id)?.name ?? "Rider";

  const store = useMemo<Store>(
    () => ({
      configured,
      ready: authChecked && (!session || loaded),
      session,
      me,
      state,
      error,
      clearError: () => setError(null),
      reload,

      signIn: async (em, password) => {
        const { error: e } = await sb().auth.signInWithPassword({ email: em.trim(), password });
        if (e) return { ok: false, message: e.message === "Invalid login credentials" ? "Wrong email or password." : e.message };
        return { ok: true, message: "Signed in" };
      },
      signOut: async () => {
        await sb().auth.signOut();
      },

      addTestOrder: () =>
        mutate((s) => {
          const n = Number(String(Date.now()).slice(-5));
          const p = makeParcel(n, Date.now(), Math.random);
          p.id = `#T${n}`;
          p.trk = `RTT${n}`;
          p.events = [{ at: Date.now(), what: "Test order added", by: actor() }];
          s.parcels.push(p);
        }),

      printLabel: (id) =>
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id);
          if (!p || p.status !== "new") return;
          p.status = "labeled";
          p.events.push({ at: Date.now(), what: "Label printed and pasted on box", by: actor() });
        }),

      printLabels: (ids) =>
        mutate((s) => {
          const at = Date.now();
          s.parcels.forEach((p) => {
            if (ids.includes(p.id) && p.status === "new") {
              p.status = "labeled";
              p.events.push({ at, what: "Label printed and pasted on box", by: actor() });
            }
          });
        }),

      handover: (riderId, trks) =>
        mutate((s) => {
          const name = riderName(s, riderId);
          const at = Date.now();
          const ids: string[] = [];
          s.parcels.forEach((p) => {
            if (trks.includes(p.trk) && p.status === "labeled") {
              p.status = "handed";
              p.riderId = riderId;
              p.events.push({ at, what: `Handed to ${name}`, by: actor() });
              ids.push(p.id);
            }
          });
          return ids;
        }),

      adminSetOutcome: (id, outcome, reason, note) => {
        const p0 = ref.current.parcels.find((x) => x.id === id);
        if (!p0) return { ok: false, message: "Parcel not found." };
        if (!["handed", "out", "delivered", "returned"].includes(p0.status))
          return { ok: false, message: "Only parcels already handed to a rider can be marked." };
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id)!;
          const at = Date.now();
          p.status = outcome;
          p.attempt = {
            outcome,
            at,
            reason: outcome === "returned" ? reason ?? "Customer not available" : undefined,
            calls: p.calls.length,
            distanceM: p.attempt?.distanceM ?? 0,
            photo: p.attempt?.photo,
            manualScan: !!p.manualScan,
            byAdmin: actor(),
            note: note || undefined,
          };
          p.flags = [];
          const what = outcome === "delivered" ? "Marked delivered by admin" : `Marked returned by admin: ${p.attempt.reason}`;
          p.events.push({ at, what: note ? `${what} · "${note}"` : what, by: actor(), kind: outcome === "delivered" ? "good" : "bad" });
        });
        return { ok: true, message: outcome === "delivered" ? `${p0.id} marked delivered.` : `${p0.id} marked returned.` };
      },

      receiveReturn: (trk) => {
        const p0 = ref.current.parcels.find((x) => x.trk.toUpperCase() === trk.toUpperCase());
        if (!p0) return { ok: false, message: `No parcel has code ${trk}.` };
        if (p0.status !== "returned") return { ok: false, message: `${p0.trk} is not waiting to be checked in.` };
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === p0.id)!;
          p.status = "received";
          p.events.push({ at: Date.now(), what: "Return checked in at warehouse", by: actor() });
        });
        return { ok: true, message: `Return ${p0.trk} checked in.` };
      },

      startRide: (code, riderId, manual) => {
        const s0 = ref.current;
        const p0 = s0.parcels.find((x) => x.trk.toUpperCase() === code.trim().toUpperCase());
        if (!p0) return { ok: false, message: `No parcel with code ${code} is handed to you. Check the label or ask the desk.` };
        if (p0.riderId !== riderId) return { ok: false, message: `${p0.trk} was handed to ${riderName(s0, p0.riderId)}, not you.` };
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
          const at = Date.now();
          p.calls.push(at);
          p.events.push({ at, what: `Called customer from app (call ${p.calls.length})`, by: riderName(s, p.riderId) });
        }),

      deliver: (id, input) => {
        const p0 = ref.current.parcels.find((x) => x.id === id);
        if (!p0 || p0.status !== "out") return { ok: false, message: "This ride is not live." };
        if (RULES.requireOtp && input.otp.trim() !== p0.otp) return { ok: false, message: "That code does not match. Ask the customer for the 4-digit code from their SMS." };
        if (!RULES.requireOtp && !input.photo) return { ok: false, message: "Take a photo of the parcel being handed over." };
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id)!;
          const at = Date.now();
          p.status = "delivered";
          p.attempt = { outcome: "delivered", at, calls: p.calls.length, distanceM: input.distanceM, photo: input.photo, otpOk: RULES.requireOtp, manualScan: !!p.manualScan };
          p.flags = flagsFor(p.attempt);
          p.events.push({ at, what: RULES.requireOtp ? "Delivered, customer code verified" : "Delivered, handover photo taken", by: riderName(s, p.riderId), kind: "good" });
        });
        return { ok: true, message: "Delivered." };
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
        if (RULES.mode === "block" && flags.some((f) => !NON_BLOCKING.includes(f))) {
          return { ok: false, message: "Some checks are not met yet.", flags };
        }
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id)!;
          p.status = "returned";
          p.attempt = attempt;
          p.flags = flags;
          p.events.push({ at: attempt.at, what: `Marked returned: ${input.reason}`, by: riderName(s, p.riderId), kind: "bad" });
        });
        return { ok: true, message: flags.length ? "Return saved and flagged for review." : "Return saved. Bring the parcel back to the warehouse.", flags };
      },

      deposit: (riderId, amount) =>
        mutate((s) => {
          s.deposits.push({ riderId, amount, at: Date.now(), by: actor() });
        }),

      saveReview: (id, review) =>
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id);
          if (!p) return;
          const at = Date.now();
          p.review = { ...review, at };
          const label = review.decision === "rider" ? "rider fault" : review.decision === "customer" ? "customer fault" : "needs more checking";
          p.events.push({ at, what: `Admin review: ${label}${review.note ? ` · "${review.note}"` : ""}`, by: actor() });
        }),

      loadSample: async () => {
        try {
          const client = sb();
          const seed = seedState();
          const rid = (id?: string) => (id ? `S${id}` : undefined);
          const riders = seed.riders.map((r) => ({ id: rid(r.id)!, name: `${r.name} (sample)`, phone: r.phone, bike: r.bike, licence: r.licence, is_sample: true }));
          const parcels: Parcel[] = seed.parcels.map((p) => ({ ...p, id: `#S${p.id.slice(1)}`, trk: p.trk.replace(/^RT/, "RTS"), riderId: rid(p.riderId), isSample: true }));
          await chunked(riders, 100, (part) => client.from("riders").upsert(part));
          await chunked(parcels.map(fromParcel), 200, (part) => client.from("parcels").upsert(part));
          await chunked(parcels.flatMap((p) => p.events.map((e) => fromEvent(p.id, e))), 500, (part) => client.from("parcel_events").insert(part));
          await chunked(seed.deposits.map((d) => fromDeposit({ ...d, riderId: rid(d.riderId)! })), 100, (part) => client.from("deposits").insert(part));
          await reload();
          return { ok: true, message: `Loaded ${parcels.length} sample parcels and ${riders.length} sample riders.` };
        } catch (err) {
          return { ok: false, message: (err as Error).message };
        }
      },

      clearSample: async () => {
        try {
          const client = sb();
          const r1 = await client.from("parcels").delete().eq("is_sample", true);
          if (r1.error) throw new Error(r1.error.message);
          const r2 = await client.from("riders").delete().eq("is_sample", true);
          if (r2.error) throw new Error(r2.error.message);
          await reload();
          return { ok: true, message: "Sample data removed." };
        } catch (err) {
          return { ok: false, message: (err as Error).message };
        }
      },
    }),
    [authChecked, session, loaded, me, state, error, reload, mutate]
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
