"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

export default function CandidatesPage() {
  const [rows, setRows] = useState<Array<{ id: string; full_name: string; email: string; job_id?: string; profile?: { skills?: string[] } }>>([]);
  useEffect(() => {
    api<typeof rows>("/api/v1/candidates").then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">Candidates</h1>
      <div className="mt-8 grid gap-3">
        {rows.map((c) => (
          <Link key={c.id} href={`/candidates/${c.id}`} className="panel p-5 hover:border-[var(--accent)]">
            <p className="font-display text-xl">{c.full_name || "Unnamed"}</p>
            <p className="text-sm text-[var(--muted)]">{c.email}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">{(c.profile?.skills || []).slice(0, 8).join(" · ")}</p>
          </Link>
        ))}
        {!rows.length && <p className="text-[var(--muted)]">No candidates yet.</p>}
      </div>
    </DashboardShell>
  );
}
