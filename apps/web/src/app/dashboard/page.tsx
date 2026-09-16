"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

type Stats = {
  active_jobs: number;
  upcoming_interviews: number;
  completed_interviews: number;
  candidates: number;
  average_score: number;
  interviews_needing_review: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Stats>("/api/v1/dashboard/overview")
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  const cards = [
    { label: "Active jobs", value: stats?.active_jobs ?? "—" },
    { label: "Upcoming interviews", value: stats?.upcoming_interviews ?? "—" },
    { label: "Completed interviews", value: stats?.completed_interviews ?? "—" },
    { label: "Candidates", value: stats?.candidates ?? "—" },
    { label: "Average score", value: stats ? stats.average_score.toFixed(1) : "—" },
    { label: "Needs review", value: stats?.interviews_needing_review ?? "—" },
  ];

  return (
    <DashboardShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Overview</h1>
          <p className="mt-2 text-[var(--muted)]">Hiring signal across jobs, interviews, and reports.</p>
        </div>
        <Link href="/jobs/new" className="btn btn-primary">
          Create Interview
        </Link>
      </div>
      {error && <p className="mt-4 text-[var(--danger)]">{error}</p>}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <p className="text-sm text-[var(--muted)]">{c.label}</p>
            <p className="font-display mt-2 text-4xl">{c.value}</p>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
