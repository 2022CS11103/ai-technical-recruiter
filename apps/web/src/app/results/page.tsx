"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { api } from "@/lib/api";

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
  score: number | null;
  status: string;
  recommendation: string;
  date: string;
};

export default function InterviewResultsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Row[]>("/api/v1/dossiers/recent", { auth: false })
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load results"));
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] p-5 sm:p-8">
        <PageHeader
          eyebrow="RECRUITER WORKSPACE"
          title="Interview results"
          description="Evidence dossiers from completed ZARA sessions — not sample data."
        />
        {error && <p className="text-sm text-muted-foreground">{error}</p>}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b border-border/70 text-[10px] uppercase tracking-[.15em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Candidate</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Score</th>
                <th className="px-5 py-3">Recommendation</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-5 py-4">
                    <Link href={`/candidates/${row.id}`} className="text-sm font-medium hover:text-blue-200">
                      {row.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.date}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{row.role}</td>
                  <td className="px-5 py-4 font-mono text-sm">{row.score ? `${row.score}/10` : "—"}</td>
                  <td className="px-5 py-4 text-sm">{row.recommendation}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !error && (
            <p className="p-12 text-center text-sm text-muted-foreground">
              No live results yet.{" "}
              <Link href="/interview/try" className="text-blue-300">
                Run an interview
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
