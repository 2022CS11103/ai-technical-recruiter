"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { AdminShell } from "@/components/app/AdminShell";
import { api } from "@/lib/api";

type Row = {
  session_id: string;
  candidate_id: string;
  name: string;
  role: string;
  status: string;
  date: string;
};

export default function AdminMonitoringPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    api<Row[]>("/api/v1/admin/interviews").then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <AdminShell>
      <div className="mx-auto max-w-[1200px] p-5 sm:p-8">
        <PageHeader
          eyebrow="INTERVIEW MONITORING"
          title="Live sessions"
          description="Review every interview across companies."
        />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-border/70 text-[10px] uppercase tracking-[.15em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Candidate</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => (
                <tr key={row.session_id} className="hover:bg-muted/20">
                  <td className="px-5 py-4">
                    <Link href={`/candidates/${row.candidate_id}`} className="text-sm font-medium hover:text-blue-200">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{row.role}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-12 text-center text-sm text-muted-foreground">No sessions yet.</p>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
