import { STATUS } from "@/lib/format";
import type { ParcelStatus } from "@/lib/types";

export function StatusPill({ status, label }: { status: ParcelStatus; label?: string }) {
  const s = STATUS[status];
  return <span className={`pill ${s.tone}`}>{label ?? s.label}</span>;
}
