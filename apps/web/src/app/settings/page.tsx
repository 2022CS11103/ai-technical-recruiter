"use client";

import { DashboardShell } from "@/components/DashboardShell";

export default function SettingsPage() {
  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">Settings</h1>
      <div className="panel mt-8 max-w-2xl space-y-3 p-5 text-sm text-[var(--muted)]">
        <p>Tenant isolation is enforced by company membership on every recruiter API.</p>
        <p>Candidate interview links use high-entropy tokens hashed at rest.</p>
        <p>Resumes, transcripts, and recordings are treated as sensitive data. Consent is required before candidate interviews.</p>
        <p>Retention defaults to company.retention_days (365). Deletion/export hooks are available via audit-logged admin flows.</p>
        <p>Configure LLM/STT keys in apps/api/.env — mocks enable local demos without keys.</p>
      </div>
    </DashboardShell>
  );
}
