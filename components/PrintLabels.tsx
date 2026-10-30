"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Parcel } from "@/lib/types";
import { LabelSheet } from "./LabelSheet";

/**
 * Hidden copy of the labels placed straight under <body>. On screen it is invisible;
 * when printing, it is the only thing printed, one label per page.
 */
export function PrintLabels({ parcels }: { parcels: Parcel[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="print-root">
      {parcels.map((p) => (
        <LabelSheet key={p.id} p={p} />
      ))}
    </div>,
    document.body
  );
}
