"use client";

import { RoleGate } from "@/components/RoleGate";

export default function WarehouseLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate roles={["warehouse", "admin"]}>{children}</RoleGate>;
}
