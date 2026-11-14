"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fromDeposit, fromEvent, fromParcel, sameEvent, toDeposit, toEvent, toParcel, toRider, type DepositRow, type EventRow, type ParcelRow, type RiderRow } from "./db";
import { blocks, flagsFor, RULES } from "./rules";
import { makeParcel, seedState } from "./seed";
import { configured, sb } from "./supabase";
import type { AppState, Deposit, Me, Parcel, ReturnReason, Review, Role } from "./types";

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
  /** Changes saved on this device that are still waiting for signal to upload. */
  pending: number;
  signIn: (email: string, password: string) => Promise<Result>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  addTestOrder: () => void;
  printLabel: (id: string) => void;
  printLabels: (ids: string[]) => void;
  /** Returns the ids of the parcels that were handed over. */
  handover: (riderId: string, trks: string[]) => string[];
  adminSetOutcome: (id: string, outcome: "delivered" | "returned", reason?: ReturnReason, note?: string) => Result;
  /** Returned parcel goes back to "Ready to hand over" with the same label. */
  sendAgain: (id: string) => Result;
  /** Parcel handed to a rider but not scanned yet comes back to the desk. */
  takeBack: (id: string) => Result;
  /** Admin: delete a test or sample parcel (never a real Shopify order). */
  deleteParcel: (id: string) => Promise<Result>;
  receiveReturn: (trk: string) => Result;
  startRide: (code: string, riderId: string, manual: boolean) => Result;
  logCall: (id: string) => void;
  deliver: (id: string, input: { otp: string; distanceM: number; photo?: string; where?: { lat: number; lng: number; acc: number } }) => Result;
  markReturn: (id: string, input: { reason: ReturnReason; distanceM: number; photo?: string; where?: { lat: number; lng: number; acc: number } }) => Result & { flags?: string[] };
  /** Warehouse records cash it counted. With a rider's QR request, a matching amount is confirmed
   *  at once; otherwise it waits for the rider to accept or dispute it on their phone. */
  deposit: (riderId: string, amount: number, request?: { requestId: string; declared: number }) => Result;
  /** Rider accepts or disputes a deposit the warehouse recorded. */
  answerDeposit: (d: Deposit, accept: boolean, note?: string) => Promise<Result>;
  /** Admin closes a disputed or unanswered deposit. */
  resolveDeposit: (d: Deposit, note?: string) => Promise<Result>;
  saveReview: (id: string, review: Omit<Review, "at">) => void;
  loadSample: () => Promise<Result>;
  clearSample: () => Promise<Result>;
}

const Ctx = createContext<Store | null>(null);
const EMPTY: AppState = { version: 1, parcels: [], riders: [], deposits: [], currentRiderId: null, nextOrder: 1 };
const OPEN = "new,labeled,handed,out,returned";

/** Runs the database's archive job; never throws and gives up after 5 seconds. */
async function archiveStale(): Promise<number> {
  try {
    const call = sb().rpc("archive_stale_parcels").then((r) => (r.error ? 0 : Number(r.data) || 0));
    return await Promise.race([call, new Promise<number>((res) => setTimeout(() => res(0), 5000))]);
  } catch {
    return 0;
  }
}
export { archiveStale };

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

/**
 * Re-dispatch a returned parcel as a new linked parcel (#1047 → #1047-R1) waiting for a label.
 * The original keeps its return, rider and evidence, so return rates stay correct.
 * Returns the new parcel, or null when it was already re-sent.
 */
function resend(s: AppState, id: string, by: string): Parcel | null {
  const p = s.parcels.find((x) => x.id === id);
  if (!p) return null;
  const base = p.id.replace(/-R\d+$/, "");
  if (s.parcels.some((x) => x.events.some((e) => e.what === `Re-dispatch of ${p.id}`))) return null;
  const n = s.parcels.filter((x) => x.id.startsWith(`${base}-R`)).length + 1;
  const at = Date.now();
  const copy: Parcel = {
    ...p,
    id: `${base}-R${n}`,
    trk: `${p.trk.replace(/-\d+$/, "")}-${n}`, // RT1047-K7 → RT1047-K7-1 (originals never end in -digits)
    status: "new",
    riderId: undefined,
    createdAt: at,
    rideStartedAt: undefined,
    manualScan: false,
    calls: [],
    attempt: undefined,
    flags: [],
    review: undefined,
    shopifySync: undefined,
    events: [{ at, what: `Re-dispatch of ${p.id}`, by }],
  };
  s.parcels.push(copy);
  p.events.push({ at, what: `Sent out again as ${copy.id}`, by });
  return copy;
}

type Op = { t: "ins"; rows: ParcelRow[] } | { t: "upd"; row: ParcelRow } | { t: "ev"; rows: EventRow[] } | { t: "dep"; rows: DepositRow[] };

const isNetworkError = (msg: string) =>
  (typeof navigator !== "undefined" && !navigator.onLine) || /failed to fetch|fetch failed|network|load failed|timed? ?out|aborted/i.test(msg);

/** Runs one queued operation. Returns an error message, or null when it was saved. */
async function runOp(op: Op): Promise<string | null> {
  try {
    const client = sb();
    let res: { error: { message: string; code?: string } | null };
    if (op.t === "ins") res = await client.from("parcels").upsert(op.rows, { onConflict: "id", ignoreDuplicates: true });
    else if (op.t === "upd") {
      const { id, ...rest } = op.row;
      res = await client.from("parcels").update(rest).eq("id", id);
    } else if (op.t === "ev") res = await client.from("parcel_events").insert(op.rows);
    else {
      res = await client.from("deposits").insert(op.rows);
      // database without update 004: save the basic deposit rather than lose it
      if (res.error && /request_id|declared|status|confirmed_at|column/i.test(res.error.message))
        res = await client.from("deposits").insert(op.rows.map(({ rider_id, amount, at, by }) => ({ rider_id, amount, at, by })));
    }
    return res.error ? res.error.message : null;
  } catch (err) {
    return (err as Error).message || "network error";
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
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const uidRef = useRef<string | undefined>(undefined);
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
        fetchAll<ParcelRow>((f, t) => client.from("parcels").select("*").or(`created_at.gte."${since}",status.in.(${OPEN})`).neq("status", "archived").order("created_at").range(f, t)),
        fetchAll<EventRow>((f, t) => client.from("parcel_events").select("parcel_id,at,what,by,kind").gte("at", since).order("at").range(f, t)),
        client.from("deposits").select("*").gte("at", since).order("at"),
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
        // Move orders not delivered within 7 days to the archive before loading (also runs nightly
        // in the database). Ignored on databases without migration 005.
        if (m.role !== "rider") await archiveStale();
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
      const { data } = await client.from("deposits").select("*").gte("at", since).order("at");
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
        if (row.status === "archived") {
          set({ ...cur, parcels: cur.parcels.filter((p) => p.id !== row.id) });
          return;
        }
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
  // ── writes, with an offline queue ──
  // Every change is turned into database operations and queued (in this browser, per login).
  // The queue uploads at once; if the phone has no signal the operations wait and retry every
  // 20 seconds and as soon as the phone is back online, so a delivery is never lost.
  const queue = useRef<Op[]>([]);
  const flushing = useRef(false);
  const [pending, setPending] = useState(0);
  const qkey = (uid: string | undefined) => `rider-trace.pending.${uid ?? "none"}`;

  const saveQueue = useCallback(() => {
    setPending(queue.current.length);
    try {
      const k = qkey(uidRef.current);
      if (queue.current.length) localStorage.setItem(k, JSON.stringify(queue.current));
      else localStorage.removeItem(k);
    } catch {
      /* storage full or blocked: the queue still lives in memory */
    }
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current || !configured) return;
    flushing.current = true;
    let failed: string | null = null;
    try {
      while (queue.current.length) {
        const msg = await runOp(queue.current[0]);
        if (msg && isNetworkError(msg)) break; // still offline: try again later
        queue.current.shift();
        saveQueue();
        if (msg) failed = msg;
      }
    } finally {
      flushing.current = false;
      setPending(queue.current.length);
    }
    if (failed) {
      setError(`Not saved: ${failed}. Reloading the latest data.`);
      await reload();
    }
  }, [reload, saveQueue]);
  flushRef.current = flush;

  // load this login's waiting operations, and retry them while any are left
  useEffect(() => {
    uidRef.current = userId;
    if (!userId) {
      queue.current = [];
      setPending(0);
      return;
    }
    try {
      queue.current = JSON.parse(localStorage.getItem(qkey(userId)) ?? "[]") as Op[];
    } catch {
      queue.current = [];
    }
    setPending(queue.current.length);
    const retry = () => void flushRef.current?.();
    const t = setInterval(() => queue.current.length && retry(), 20000);
    window.addEventListener("online", retry);
    retry();
    return () => {
      clearInterval(t);
      window.removeEventListener("online", retry);
    };
  }, [userId]);

  const persist = useCallback(
    async (before: AppState, after: AppState) => {
      const prev = new Map(before.parcels.map((p) => [p.id, p] as const));
      const inserts: ParcelRow[] = [];
      const ops: Op[] = [];
      const events: EventRow[] = [];
      for (const p of after.parcels) {
        const o = prev.get(p.id);
        if (!o) {
          inserts.push(fromParcel(p));
          events.push(...p.events.map((e) => fromEvent(p.id, e)));
          continue;
        }
        if (JSON.stringify(fromParcel(p)) !== JSON.stringify(fromParcel(o))) ops.push({ t: "upd", row: fromParcel(p) });
        if (p.events.length > o.events.length) events.push(...p.events.slice(o.events.length).map((e) => fromEvent(p.id, e)));
      }
      if (inserts.length) ops.unshift({ t: "ins", rows: inserts });
      if (events.length) ops.push({ t: "ev", rows: events });
      const deposits = after.deposits.slice(before.deposits.length).map(fromDeposit);
      if (deposits.length) ops.push({ t: "dep", rows: deposits });
      if (!ops.length) return;
      queue.current.push(...ops);
      saveQueue();
      await flush();
    },
    [flush, saveQueue]
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
      pending,
      clearError: () => setError(null),
      reload,

      signIn: async (em, password) => {
        const { error: e } = await sb().auth.signInWithPassword({ email: em.trim(), password });
        if (e) return { ok: false, message: e.message === "Invalid login credentials" ? "Wrong email or password." : e.message };
        return { ok: true, message: "Signed in" };
      },
      signOut: async () => {
        await flushRef.current?.(); // anything still waiting stays queued for this login's next sign-in
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

      sendAgain: (id) => {
        const p0 = ref.current.parcels.find((x) => x.id === id);
        if (!p0) return { ok: false, message: "Parcel not found." };
        if (p0.status !== "received") return { ok: false, message: "Check the return in at the warehouse first." };
        const copy = mutate((s) => resend(s, id, actor()));
        return copy ? { ok: true, message: `${copy.id} created. Print its label from the warehouse desk.` } : { ok: false, message: "Already sent again." };
      },

      takeBack: (id) => {
        const p0 = ref.current.parcels.find((x) => x.id === id);
        if (!p0) return { ok: false, message: "Parcel not found." };
        if (p0.status !== "handed") return { ok: false, message: "Only parcels the rider has not scanned yet can be taken back." };
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id)!;
          const from = riderName(s, p.riderId);
          p.status = "labeled";
          p.riderId = undefined;
          p.events.push({ at: Date.now(), what: `Taken back from ${from}`, by: actor() });
        });
        return { ok: true, message: `${p0.id} is back at the desk.` };
      },

      deleteParcel: async (id) => {
        const p0 = ref.current.parcels.find((x) => x.id === id);
        if (!p0) return { ok: false, message: "Parcel not found." };
        if (p0.shopifyOrderId) return { ok: false, message: "Real Shopify orders can't be deleted. Cancel the order in Shopify instead." };
        set({ ...ref.current, parcels: ref.current.parcels.filter((x) => x.id !== id) });
        const { error: e } = await sb().from("parcels").delete().eq("id", id);
        if (e) {
          await reload();
          return { ok: false, message: e.message };
        }
        return { ok: true, message: `${p0.id} deleted.` };
      },

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
          if (p.review?.resend) resend(s, p.id, actor());
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
          p.attempt = { outcome: "delivered", at, calls: p.calls.length, distanceM: input.distanceM, photo: input.photo, otpOk: RULES.requireOtp, manualScan: !!p.manualScan, where: input.where };
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
          where: input.where,
        };
        const flags = flagsFor(attempt);
        if (RULES.mode === "block" && flags.some(blocks)) {
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

      deposit: (riderId, amount, request) => {
        if (request && ref.current.deposits.some((d) => d.requestId === request.requestId))
          return { ok: false, message: "This cash QR was already used. Ask the rider to open a new one." };
        const at = Date.now();
        const matches = !!request && Math.round(request.declared) === Math.round(amount);
        mutate((s) => {
          s.deposits.push({
            riderId,
            amount,
            at,
            by: actor(),
            requestId: request?.requestId,
            declared: request?.declared,
            status: matches ? "confirmed" : "pending",
            confirmedAt: matches ? at : undefined,
          });
        });
        return {
          ok: true,
          message: matches ? "Recorded. The rider's phone shows it as received." : "Recorded. The rider must accept or dispute the amount on their phone.",
        };
      },

      answerDeposit: async (d, accept, note) => {
        const patch = { status: accept ? "confirmed" : "disputed", rider_note: note?.trim() || null, confirmed_at: new Date().toISOString() };
        const same = (x: Deposit) => (d.id !== undefined ? x.id === d.id : x.requestId === d.requestId && x.at === d.at);
        set({ ...ref.current, deposits: ref.current.deposits.map((x) => (same(x) ? { ...x, status: accept ? "confirmed" : "disputed", riderNote: note?.trim() || undefined, confirmedAt: Date.now() } : x)) });
        const q = sb().from("deposits").update(patch);
        const { error: e } = d.id !== undefined ? await q.eq("id", d.id) : await q.eq("request_id", d.requestId ?? "");
        if (e) {
          await reload();
          return { ok: false, message: `Not saved: ${e.message}` };
        }
        return { ok: true, message: accept ? "Thanks, deposit confirmed." : "Dispute sent to the admin." };
      },

      resolveDeposit: async (d, note) => {
        if (d.id === undefined) return { ok: false, message: "Reload the page and try again." };
        const by = `${actor()}${note?.trim() ? ` · ${note.trim()}` : ""}`.slice(0, 200);
        set({ ...ref.current, deposits: ref.current.deposits.map((x) => (x.id === d.id ? { ...x, status: "resolved", resolvedBy: by } : x)) });
        const { error: e } = await sb().from("deposits").update({ status: "resolved", resolved_by: by }).eq("id", d.id);
        if (e) {
          await reload();
          return { ok: false, message: `Not saved: ${e.message}` };
        }
        return { ok: true, message: "Marked resolved." };
      },

      saveReview: (id, review) =>
        mutate((s) => {
          const p = s.parcels.find((x) => x.id === id);
          if (!p) return;
          const at = Date.now();
          p.review = { ...review, at };
          if (review.resend && p.status === "received") resend(s, p.id, actor());
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
    [authChecked, session, loaded, me, state, error, pending, reload, mutate]
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

/**
 * Cash a rider is holding: all COD they delivered minus all their deposits (within the loaded
 * 10 days), so cash not handed in yesterday is still owed today. `collected` and `deposited`
 * are today's figures, for display.
 */
export function cashInHand(s: AppState, riderId: string) {
  const today = new Date().toDateString();
  const delivered = s.parcels.filter((p) => p.riderId === riderId && p.status === "delivered" && p.attempt);
  const deposits = s.deposits.filter((d) => d.riderId === riderId);
  const owed = delivered.reduce((sum, p) => sum + p.cod, 0) - deposits.reduce((sum, d) => sum + d.amount, 0);
  const collected = delivered.filter((p) => new Date(p.attempt!.at).toDateString() === today).reduce((sum, p) => sum + p.cod, 0);
  const deposited = deposits.filter((d) => new Date(d.at).toDateString() === today).reduce((sum, d) => sum + d.amount, 0);
  return { collected, deposited, inHand: Math.max(0, owed), carried: Math.max(0, owed - (collected - deposited)) };
}
