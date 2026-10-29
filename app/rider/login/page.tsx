"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Old rider login address. Everyone now signs in at /login. */
export default function OldRiderLogin() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login");
  }, [router]);
  return null;
}
