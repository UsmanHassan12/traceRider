import type { Parcel } from "./types";

/** Event the rider's pickup scan writes. Kept in the custody log, so no extra database column. */
export const PICKED = "Picked up from warehouse";

/** When the rider scanned this parcel at pickup (undefined = not picked up yet). */
export function pickedAt(p: Parcel): number | undefined {
  return p.events.find((e) => e.what.startsWith(PICKED))?.at;
}

/** Handed to the rider and scanned by him at the warehouse, but delivery not started. */
export const isReady = (p: Parcel) => p.status === "handed" && pickedAt(p) !== undefined;
/** Handed to the rider, but he has not scanned it yet. */
export const isToPick = (p: Parcel) => p.status === "handed" && pickedAt(p) === undefined;

/** Number of failed tries the rider chose to reattempt. */
export const reattempts = (p: Parcel) => p.attempts?.length ?? 0;
/** Waiting for the rider to try again (not out on the road right now). */
export const isReattempt = (p: Parcel) => p.status === "handed" && reattempts(p) > 0;
