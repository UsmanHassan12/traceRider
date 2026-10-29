"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor, useStore } from "@/lib/store";
import type { Role } from "@/lib/types";

/** Shows children only to signed-in staff with one of the given roles. */
export function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { configured, ready, session, me, signOut } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (configured && ready && !session) router.replace("/login");
  }, [configured, ready, session, router]);

  if (!configured) return <SetupNeeded />;
  if (!ready || !session) return <div aria-busy="true" style={{ minHeight: "100dvh" }} />;

  if (!me) {
    return (
      <Message title="No role on this login yet">
        You are signed in as {session.user.email}, but the admin hasn&apos;t given this login a role. Ask the admin to add you on the Staff page.
        <button type="button" className="btn" onClick={() => signOut()}>Sign out</button>
      </Message>
    );
  }
  if (!roles.includes(me.role)) {
    return (
      <Message title="This screen isn't for your login">
        You are signed in as a {me.role}.
        <Link href={homeFor(me.role)} className="btn navy">Go to your screen</Link>
      </Message>
    );
  }
  if (me.role === "rider" && !me.riderId) {
    return (
      <Message title="Rider profile missing">
        This rider login isn&apos;t linked to a rider. Ask the admin to fix it on the Staff page.
        <button type="button" className="btn" onClick={() => signOut()}>Sign out</button>
      </Message>
    );
  }
  return <>{children}</>;
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: "64px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
      <h1>{title}</h1>
      <div className="muted" style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </main>
  );
}

export function SetupNeeded() {
  return (
    <Message title="Connect Supabase">
      <span>
        Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code> (or to the
        project&apos;s Environment Variables on Vercel), then restart. The values are in Supabase under Project Settings › API.
      </span>
    </Message>
  );
}
