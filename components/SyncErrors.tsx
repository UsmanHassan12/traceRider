"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "./Toast";

/** Shows database errors from the store as a toast. */
export function SyncErrors() {
  const { error, clearError } = useStore();
  const toast = useToast();
  useEffect(() => {
    if (error) {
      toast(error, "bad");
      clearError();
    }
  }, [error, clearError, toast]);
  return null;
}
