"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** All parcels now live on the rider's Home screen. Kept so old links and installed apps still work. */
export default function ParcelsRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/rider"), [router]);
  return null;
}
