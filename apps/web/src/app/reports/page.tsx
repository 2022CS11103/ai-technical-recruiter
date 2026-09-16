"use client";

import { DashboardShell } from "@/components/DashboardShell";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function ReportsIndexPage() {
  const [interviews, setInterviews] = useState<Array<{ id: string; status: string }>>([]);
  useEffect(() => {
    api<typeof interviews>("/api/v1/interviews").then(setInterviews).catch(() => setInterviews([]));
  }, []);
  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">Reports</h1>
      <p className="mt-2 text-[var(--muted)]">Open a completed interview to view its report.</p>
      <div className="mt-8 grid gap-3">
        {interviews
          .filter((i) => i.status === "completed")
          .map((i) => (
            <Link key={i.id} href={`/interviews/${i.id}`} className="panel p-5">
              Interview {i.id}
            </Link>
          ))}
      </div>
    </DashboardShell>
  );
}
