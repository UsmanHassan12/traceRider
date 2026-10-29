import type { Attempt } from "./types";

/** Proof rules a return must meet. Change these to tune how strict the app is. */
export const RULES = {
  minCalls: 2,
  maxDistanceM: 300,
  photoRequired: true,
  /** "block": the rider cannot save a return that fails a check.
   *  "flag": the return is saved but flagged for admin review. */
  mode: "block" as "block" | "flag",
  cashLimit: 25000,
};

/** Demo mode shows OTPs and a distance slider so the flow can be tried away from real addresses. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO !== "false";

export function flagsFor(a: Pick<Attempt, "outcome" | "calls" | "distanceM" | "photo" | "manualScan" | "customerReply">): string[] {
  const f: string[] = [];
  if (a.distanceM > RULES.maxDistanceM) f.push(`Marked ${a.distanceM >= 1000 ? (a.distanceM / 1000).toFixed(1) + " km" : a.distanceM + " m"} from address`);
  if (a.outcome === "returned") {
    if (a.calls === 0) f.push("No call made");
    else if (a.calls < RULES.minCalls) f.push(`Only ${a.calls} call`);
    if (RULES.photoRequired && !a.photo) f.push("No doorstep photo");
    if (a.customerReply && /no one came|nobody came|was home/i.test(a.customerReply)) f.push("Customer says no one came");
  }
  if (a.manualScan) f.push("Code typed, not scanned");
  return f;
}
