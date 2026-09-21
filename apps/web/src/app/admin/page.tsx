"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app/PageHeader";
import { MetricCard } from "@/components/app/MetricCard";
import { AdminShell } from "@/components/app/AdminShell";
import { api } from "@/lib/api";

type Overview = {
  users: number;
  banned_users: number;
  interviews: number;
  live_interviews: number;
  completed_interviews: number;
};

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    api<Overview>("/api/v1/admin/overview").then(setData).catch(() => setData(null));
  }, []);

  return (
    <AdminShell>
      <div className="mx-auto max-w-[1200px] p-5 sm:p-8">
        <PageHeader
          eyebrow="ADMINISTRATION"
          title="Platform overview"
          description="Monitor users and live interviews across every tenant."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Users" value={String(data?.users ?? "—")} detail="accounts" trend="up" />
          <MetricCard
            label="Live interviews"
            value={String(data?.live_interviews ?? "—")}
            detail="in progress"
            trend="up"
            accent="green"
          />
          <MetricCard
            label="Completed"
            value={String(data?.completed_interviews ?? "—")}
            detail="sessions"
            trend="up"
            accent="violet"
          />
          <MetricCard
            label="Banned"
            value={String(data?.banned_users ?? "—")}
            detail="users"
            trend="down"
            accent="amber"
          />
        </div>
        <Card className="mt-6">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Use Users to ban accounts, Interview monitoring to review live sessions, and Audit log for
            credit and profile events.
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
