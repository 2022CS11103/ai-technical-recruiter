"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

type Job = { id: string; title: string; status: string; difficulty: string; interview_duration_minutes: number };

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    api<Job[]>("/api/v1/jobs").then(setJobs).catch(() => setJobs([]));
  }, []);

  return (
    <DashboardShell>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Jobs</h1>
          <p className="mt-2 text-[var(--muted)]">Roles configured for AI interviews.</p>
        </div>
        <Link href="/jobs/new" className="btn btn-primary">
          New job
        </Link>
      </div>
      <div className="mt-8 grid gap-3">
        {jobs.map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`} className="panel flex items-center justify-between p-5 hover:border-[var(--accent)]">
            <div>
              <p className="font-display text-xl">{job.title}</p>
              <p className="text-sm text-[var(--muted)]">
                {job.difficulty} · {job.interview_duration_minutes} min · {job.status}
              </p>
            </div>
            <span className="text-sm text-[var(--accent)]">Open</span>
          </Link>
        ))}
        {!jobs.length && <p className="text-[var(--muted)]">No jobs yet. Create one to begin.</p>}
      </div>
    </DashboardShell>
  );
}
