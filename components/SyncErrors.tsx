"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "./Toast";

/** Shows database errors as a toast, and a banner while changes wait for signal to upload. */
export function SyncErrors() {
  const { error, clearError, pending } = useStore();
  const toast = useToast();
  useEffect(() => {
    if (error) {
      toast(error, "bad");
      clearError();
    }
  }, [error, clearError, toast]);
  // only show the banner when changes have waited a few seconds (a normal save takes under one)
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!pending) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(t);
  }, [pending]);
  if (!pending || !show) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: "calc(8px + env(safe-area-inset-top, 0px))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 70,
        background: "var(--amber-soft)",
        color: "var(--amber-ink)",
        border: "1px solid #f0d3a6",
        borderRadius: 99,
        padding: "6px 14px",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 4px 14px rgba(0,0,0,.12)",
        maxWidth: "calc(100% - 32px)",
        textAlign: "center",
      }}
    >
      No signal: {pending} change{pending > 1 ? "s" : ""} saved on this phone, uploading when back online
    </div>
  );
}
