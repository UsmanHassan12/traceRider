export type ParcelStatus =
  | "new" // synced from Shopify, no label yet
  | "labeled" // label printed and pasted, waiting at the desk
  | "handed" // handed to a rider, rider has not scanned it yet
  | "out" // rider scanned it, ride is live
  | "delivered"
  | "returned" // rider marked it returned, parcel on its way back
  | "received"; // return checked back in at the warehouse

export type ReturnReason =
  | "Customer not available"
  | "Phone switched off"
  | "Customer refused parcel"
  | "Wrong or incomplete address"
  | "Customer asked to reschedule";

export interface CustodyEvent {
  at: number;
  what: string;
  by: string;
  kind?: "info" | "good" | "bad";
}

export interface Attempt {
  outcome: "delivered" | "returned";
  at: number;
  reason?: ReturnReason;
  calls: number;
  distanceM: number;
  photo?: string; // data URL (small JPEG)
  otpOk?: boolean;
  manualScan: boolean;
  customerReply?: string;
}

export type ReviewDecision = "rider" | "customer" | "check";

export interface Review {
  decision: ReviewDecision;
  note: string;
  resend: boolean;
  at: number;
}

export interface Parcel {
  id: string; // Shopify order number, e.g. "#1047"
  trk: string; // QR / tracking code, e.g. "RT1047-K7"
  customer: string;
  phone: string;
  address: string;
  area: string;
  item: string;
  cod: number;
  otp: string;
  lat: number;
  lng: number;
  status: ParcelStatus;
  riderId?: string;
  createdAt: number;
  rideStartedAt?: number;
  manualScan?: boolean;
  calls: number[]; // timestamps of calls placed from the app on the live ride
  attempt?: Attempt;
  flags: string[];
  review?: Review;
  events: CustodyEvent[];
}

export interface Rider {
  id: string;
  name: string;
  phone: string; // digits only, no +92
  bike: string;
  licence: string;
}

export interface Deposit {
  riderId: string;
  amount: number;
  at: number;
  by: string;
}

export interface AppState {
  version: number;
  parcels: Parcel[];
  riders: Rider[];
  deposits: Deposit[];
  currentRiderId: string | null;
  nextOrder: number;
}
