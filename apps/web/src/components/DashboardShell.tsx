"use client";

import { AppShell } from "@/components/app/AppShell";

/** @deprecated Prefer AppShell — kept so existing pages keep working. */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
