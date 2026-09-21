"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { AdminShell } from "@/components/app/AdminShell";
import { api } from "@/lib/api";

type Row = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
};

export default function AdminAuditPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    api<Row[]>("/api/v1/admin/audit").then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <AdminShell>
      <div className="mx-auto max-w-[1200px] p-5 sm:p-8">
        <PageHeader
          eyebrow="ACCESS & IDENTITY"
          title="Audit log"
          description="Registration, credits, bans, CV uploads, and interview starts."
        />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-border/70 text-[10px] uppercase tracking-[.15em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Resource</th>
                <th className="px-5 py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4 text-sm">{row.action.replaceAll("_", " ")}</td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {row.resource_type} {row.resource_id}
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">{row.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-12 text-center text-sm text-muted-foreground">No audit events yet.</p>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
