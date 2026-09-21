"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { AdminShell } from "@/components/app/AdminShell";
import { api } from "@/lib/api";

type Row = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

export default function AdminUsersPage() {
  const [rows, setRows] = useState<Row[]>([]);

  const load = () => api<Row[]>("/api/v1/admin/users").then(setRows).catch(() => setRows([]));

  useEffect(() => {
    load();
  }, []);

  async function toggleBan(row: Row) {
    try {
      await api(`/api/v1/admin/users/${row.id}/ban`, {
        method: "POST",
        body: JSON.stringify({ banned: row.is_active, reason: "admin_action" }),
      });
      toast.success(row.is_active ? `Banned ${row.email}` : `Restored ${row.email}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ban failed");
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-[1200px] p-5 sm:p-8">
        <PageHeader
          eyebrow="USER MANAGEMENT"
          title="Users"
          description="Ban or restore recruiter and candidate accounts."
        />
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-border/70 text-[10px] uppercase tracking-[.15em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium">{row.full_name}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  </td>
                  <td className="px-5 py-4 text-sm capitalize">{row.role}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={row.is_active ? "Active" : "Banned"} />
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">{row.created_at}</td>
                  <td className="px-5 py-4 text-right">
                    <Button variant="outline" size="sm" onClick={() => toggleBan(row)}>
                      {row.is_active ? "Ban" : "Restore"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
