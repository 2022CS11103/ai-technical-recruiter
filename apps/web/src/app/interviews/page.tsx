"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

export default function InterviewsPage() {
  const [rows, setRows] = useState<Array<{ id: string; status: string; job_id: string; candidate_id: string; duration_minutes: number }>>([]);
  useEffect(() => {
    api<typeof rows>("/api/v1/interviews").then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">Interviews</h1>
      <div className="mt-8 grid gap-3">
        {rows.map((i) => (
          <Link key={i.id} href={`/interviews/${i.id}`} className="panel flex items-center justify-between p-5">
            <div>
              <p className="font-display text-lg">{i.id}</p>
              <p className="text-sm text-[var(--muted)]">
                {i.status} · {i.duration_minutes} min
              </p>
            </div>
            <span className="text-[var(--accent)] text-sm">Review</span>
          </Link>
        ))}
        {!rows.length && <p className="text-[var(--muted)]">No interviews yet.</p>}
      </div>
    </DashboardShell>
  );
}
