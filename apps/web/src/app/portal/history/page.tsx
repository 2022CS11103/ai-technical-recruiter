"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { CandidateShell } from "@/components/app/CandidateShell";
import { api } from "@/lib/api";

type Row = {
  id: string;
  session_id: string;
  role: string;
  status: string;
  date: string;
  has_feedback: boolean;
};

export default function InterviewHistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    api<Row[]>("/api/v1/portal/interviews").then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <CandidateShell>
      <div className="mx-auto max-w-[1100px] p-5 sm:p-8">
        <PageHeader
          eyebrow="CANDIDATE EXPERIENCE"
          title="Interview history"
          description="Every completed ZARA session stores feedback from the evidence collected."
        />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-border/70 text-[10px] uppercase tracking-[.15em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Feedback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => (
                <tr key={row.session_id}>
                  <td className="px-5 py-4 text-sm">{row.role}</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{row.date}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {row.has_feedback ? (
                      <Link href={`/portal/feedback/${row.id}`} className="text-blue-300">
                        View feedback
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-12 text-center text-sm text-muted-foreground">
              No interviews yet.{" "}
              <Link href="/interview/try" className="text-blue-300">
                Start a voice interview
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </CandidateShell>
  );
}
