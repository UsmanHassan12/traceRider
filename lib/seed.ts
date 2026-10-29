import type { AppState, Parcel, ReturnReason, Rider } from "./types";
import { flagsFor } from "./rules";

/** Sample data so every screen has a realistic day to show. Replace with Shopify + your API later. */

export const RIDERS: Rider[] = [
  { id: "R-014", name: "Bilal Ahmed", phone: "3001234471", bike: "Honda CD 70 · RIK-4471", licence: "Valid till Mar 2028" },
  { id: "R-009", name: "Zeeshan Ali", phone: "3011112209", bike: "Honda CD 70 · RIR-2209", licence: "Valid till Jan 2027" },
  { id: "R-021", name: "Kamran Yousaf", phone: "3021115530", bike: "Yamaha YB 125 · RIM-5530", licence: "Valid till Aug 2027" },
  { id: "R-017", name: "Shoaib Rehman", phone: "3031111187", bike: "Honda CD 70 · RIK-1187", licence: "Valid till Jun 2028" },
  { id: "R-011", name: "Faisal Iqbal", phone: "3041117702", bike: "Suzuki GD 110 · RIA-7702", licence: "Valid till Nov 2026" },
  { id: "R-006", name: "Asad Mehmood", phone: "3051118813", bike: "Honda CD 70 · RIR-8813", licence: "Valid till Feb 2029" },
];

export const AREAS: { name: string; lat: number; lng: number }[] = [
  { name: "G-11/2, Islamabad", lat: 33.669, lng: 72.998 },
  { name: "F-10 Markaz, Islamabad", lat: 33.695, lng: 73.012 },
  { name: "G-9/1, Islamabad", lat: 33.689, lng: 73.032 },
  { name: "E-11/3, Islamabad", lat: 33.701, lng: 72.975 },
  { name: "Bahria Town Phase 7, Rawalpindi", lat: 33.538, lng: 73.121 },
  { name: "DHA Phase 2, Islamabad", lat: 33.531, lng: 73.155 },
  { name: "Satellite Town, Rawalpindi", lat: 33.637, lng: 73.071 },
  { name: "I-8/3, Islamabad", lat: 33.667, lng: 73.077 },
  { name: "F-7 Markaz, Islamabad", lat: 33.72, lng: 73.056 },
  { name: "Saddar, Rawalpindi", lat: 33.597, lng: 73.053 },
  { name: "G-10/3, Islamabad", lat: 33.68, lng: 73.016 },
  { name: "F-11 Markaz, Islamabad", lat: 33.684, lng: 72.988 },
];

const NAMES = [
  "Ayesha Khan", "Hamza Yousaf", "Sana Tariq", "Usman Farooq", "Mahnoor Iqbal", "Fahad Shah", "Iqra Javed", "Hassan Raza",
  "Zainab Malik", "Ahmed Nawaz", "Noor Fatima", "Saad Afridi", "Hira Baig", "Waleed Khattak", "Amna Sheikh", "Talha Qureshi",
  "Maryam Siddiqui", "Junaid Akhtar", "Rabia Anwar", "Omer Durrani", "Laiba Hussain", "Kashif Mirza", "Fatima Gul", "Areeba Naqvi",
];
const ITEMS = [
  "Vitamin C 1000mg x2", "Baby diapers (L) pack", "Sunscreen SPF 50", "Face wash + moisturiser", "Protein powder 1kg",
  "Hair serum", "Multivitamin tablets", "Blood pressure monitor", "Perfume 100ml", "Lip care set",
];
const LETTERS = "KPBMTWCRDHQZLSVFJ";

function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function makeParcel(n: number, createdAt: number, rand: () => number): Parcel {
  const orderNo = 1000 + n;
  const area = AREAS[Math.floor(rand() * AREAS.length)];
  const jitter = () => (rand() - 0.5) * 0.006;
  return {
    id: "#" + orderNo,
    trk: `RT${orderNo}-${LETTERS[n % LETTERS.length]}${n % 10}`,
    customer: NAMES[n % NAMES.length],
    phone: "03" + String(100000000 + Math.floor(rand() * 899999999)).slice(0, 9),
    address: `House ${3 + Math.floor(rand() * 180)}, Street ${1 + Math.floor(rand() * 30)}, ${area.name}`,
    area: area.name.split(",")[0],
    item: ITEMS[Math.floor(rand() * ITEMS.length)],
    cod: Math.round((900 + rand() * 5200) / 50) * 50,
    otp: String(1000 + Math.floor(rand() * 8999)),
    lat: area.lat + jitter(),
    lng: area.lng + jitter(),
    status: "new",
    createdAt,
    calls: [],
    flags: [],
    events: [{ at: createdAt, what: "Order synced from Shopify", by: "Shopify" }],
  };
}

type Plan = { rider: string; del: number; ret: number; flagged: number };
const PLAN: Plan[] = [
  { rider: "R-009", del: 25, ret: 9, flagged: 6 },
  { rider: "R-021", del: 27, ret: 5, flagged: 2 },
  { rider: "R-017", del: 27, ret: 4, flagged: 0 },
  { rider: "R-011", del: 28, ret: 3, flagged: 0 },
  { rider: "R-006", del: 30, ret: 3, flagged: 1 },
  { rider: "R-014", del: 34, ret: 2, flagged: 0 },
];

export function seedState(): AppState {
  const rand = rng(20261028);
  const now = Date.now();
  const nine = new Date(now);
  nine.setHours(9, 0, 0, 0);
  const start = Math.min(nine.getTime(), now - 8 * 3600e3);
  const end = now - 10 * 60e3;
  const parcels: Parcel[] = [];
  let n = 1;
  const desk = "Imran · Desk 2";

  const closed: { rider: string; outcome: "delivered" | "returned"; flagged: boolean }[] = [];
  PLAN.forEach((p) => {
    for (let i = 0; i < p.del; i++) closed.push({ rider: p.rider, outcome: "delivered", flagged: false });
    for (let i = 0; i < p.ret; i++) closed.push({ rider: p.rider, outcome: "returned", flagged: i < p.flagged });
  });
  // shuffle so the day interleaves riders
  for (let i = closed.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [closed[i], closed[j]] = [closed[j], closed[i]];
  }

  const reasons: ReturnReason[] = ["Customer not available", "Phone switched off", "Customer refused parcel", "Wrong or incomplete address", "Customer asked to reschedule"];
  closed.forEach((c, i) => {
    const at = start + ((end - start) * (i + 1)) / (closed.length + 1);
    const created = at - (100 + rand() * 80) * 60e3;
    const p = makeParcel(n++, created, rand);
    const r = RIDERS.find((x) => x.id === c.rider)!;
    p.riderId = r.id;
    p.events.push({ at: created + 25 * 60e3, what: "Label printed and pasted on box", by: desk });
    p.events.push({ at: created + 50 * 60e3, what: `Handed to ${r.name}`, by: desk });
    p.rideStartedAt = created + 55 * 60e3;
    p.events.push({ at: p.rideStartedAt, what: "QR scanned, ride started", by: r.name });
    if (c.outcome === "delivered") {
      p.status = "delivered";
      p.attempt = { outcome: "delivered", at, calls: 0, distanceM: Math.round(10 + rand() * 120), otpOk: true, manualScan: false };
      p.events.push({ at, what: "Delivered, customer code verified", by: r.name, kind: "good" });
    } else {
      const flagged = c.flagged;
      const reason = flagged ? (rand() < 0.65 ? reasons[0] : reasons[1]) : reasons[Math.floor(rand() * reasons.length)];
      const variant = Math.floor(rand() * 3);
      p.attempt = {
        outcome: "returned",
        at,
        reason,
        calls: flagged ? (variant === 1 ? 1 : 0) : 2 + Math.floor(rand() * 2),
        distanceM: flagged && variant !== 1 ? Math.round(1200 + rand() * 1500) : Math.round(15 + rand() * 150),
        photo: flagged && variant === 1 ? undefined : "seed",
        manualScan: flagged && variant === 2,
        customerReply: flagged && variant === 0 ? "I was home, no one came" : undefined,
      };
      p.flags = flagsFor(p.attempt);
      p.status = rand() < 0.7 ? "received" : "returned";
      p.events.push({ at, what: `Marked returned: ${reason}`, by: r.name, kind: "bad" });
      if (p.attempt.customerReply) p.events.push({ at: at + 11 * 60e3, what: `Customer replied to SMS: "${p.attempt.customerReply}"`, by: p.customer, kind: "bad" });
      if (p.status === "received") p.events.push({ at: Math.min(now, at + 70 * 60e3), what: "Return checked in at warehouse", by: desk });
    }
    parcels.push(p);
  });

  // Live work for the demo rider (Bilal) and others
  const live = (rid: string, minsAgo: number) => {
    const t = now - minsAgo * 60e3;
    const p = makeParcel(n++, t - 70 * 60e3, rand);
    const r = RIDERS.find((x) => x.id === rid)!;
    p.riderId = rid;
    p.status = "out";
    p.rideStartedAt = t;
    p.events.push({ at: t - 40 * 60e3, what: "Label printed and pasted on box", by: desk });
    p.events.push({ at: t - 10 * 60e3, what: `Handed to ${r.name}`, by: desk });
    p.events.push({ at: t, what: "QR scanned, ride started", by: r.name });
    parcels.push(p);
  };
  live("R-014", 14);
  live("R-014", 6);
  ["R-009", "R-021", "R-017", "R-011", "R-006"].forEach((rid, i) => {
    live(rid, 8 + i * 7);
    live(rid, 20 + i * 5);
  });
  for (let i = 0; i < 5; i++) live(["R-009", "R-021", "R-017", "R-011", "R-006"][i], 33 + i * 3);

  const handed = (rid: string) => {
    const p = makeParcel(n++, now - 80 * 60e3, rand);
    const r = RIDERS.find((x) => x.id === rid)!;
    p.riderId = rid;
    p.status = "handed";
    p.events.push({ at: now - 45 * 60e3, what: "Label printed and pasted on box", by: desk });
    p.events.push({ at: now - 12 * 60e3, what: `Handed to ${r.name}`, by: desk });
    parcels.push(p);
  };
  handed("R-014");
  handed("R-014");
  handed("R-014");

  for (let i = 0; i < 4; i++) {
    const p = makeParcel(n++, now - (60 + i * 15) * 60e3, rand);
    p.status = "labeled";
    p.events.push({ at: now - (30 + i * 5) * 60e3, what: "Label printed and pasted on box", by: desk });
    parcels.push(p);
  }
  for (let i = 0; i < 6; i++) parcels.push(makeParcel(n++, now - (4 + i * 14) * 60e3, rand));

  // Bilal already deposited part of today's cash
  const bilalCash = parcels
    .filter((p) => p.riderId === "R-014" && p.status === "delivered")
    .reduce((s, p) => s + p.cod, 0);

  return {
    version: 1,
    parcels,
    riders: RIDERS,
    deposits: [{ riderId: "R-014", amount: Math.max(0, bilalCash - 18450), at: start + (end - start) * 0.55, by: desk }],
    currentRiderId: null,
    nextOrder: n,
  };
}
