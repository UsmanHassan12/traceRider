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
  /** Ask for the customer's 4-digit code on delivery. Turn on once an SMS provider sends the code
   *  to customers (NEXT_PUBLIC_REQUIRE_OTP=true). While off, a handover photo is required instead. */
  requireOtp: process.env.NEXT_PUBLIC_REQUIRE_OTP === "true",
};

/** Demo helpers: show the customer code and a distance slider so the flow can be tried away from
 *  real addresses. Off unless NEXT_PUBLIC_DEMO=true. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "true";

/** Flags that are recorded for review but never block the rider. */
export const NON_BLOCKING = ["Code typed, not scanned", "Address has no map pin"];

export function flagsFor(a: Pick<Attempt, "outcome" | "calls" | "distanceM" | "photo" | "manualScan" | "customerReply">): string[] {
  const f: string[] = [];
  if (a.distanceM < 0) f.push("Address has no map pin");
  else if (a.distanceM > RULES.maxDistanceM)
    f.push(`Marked ${a.distanceM >= 1000 ? (a.distanceM / 1000).toFixed(1) + " km" : a.distanceM + " m"} from address`);
  if (a.outcome === "returned") {
    if (a.calls === 0) f.push("No call made");
    else if (a.calls < RULES.minCalls) f.push(`Only ${a.calls} call`);
    if (RULES.photoRequired && !a.photo) f.push("No doorstep photo");
    if (a.customerReply && /no one came|nobody came|was home/i.test(a.customerReply)) f.push("Customer says no one came");
  }
  if (a.manualScan) f.push("Code typed, not scanned");
  return f;
}
