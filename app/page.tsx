"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SetupNeeded } from "@/components/RoleGate";
import { homeFor, useStore } from "@/lib/store";

/** Sends each person to their own screen. */
export default function Home() {
  const { configured, ready, session, me } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (!configured || !ready) return;
    if (!session) router.replace("/login");
    else if (me) router.replace(homeFor(me.role));
    else router.replace("/login");
  }, [configured, ready, session, me, router]);
  if (!configured) return <SetupNeeded />;
  return <div aria-busy="true" style={{ minHeight: "100dvh" }} />;
}
