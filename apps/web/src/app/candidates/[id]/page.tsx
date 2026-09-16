"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

export default function CandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const [candidate, setCandidate] = useState<Record<string, unknown> | null>(null);
  const [match, setMatch] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api(`/api/v1/candidates/${params.id}`).then(setCandidate).catch(() => setCandidate(null));
    api(`/api/v1/candidates/${params.id}/match`).then(setMatch).catch(() => setMatch(null));
  }, [params.id]);

  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">{(candidate?.full_name as string) || "Candidate"}</h1>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Parsed resume</h2>
          <pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap text-sm text-[var(--muted)]">
            {JSON.stringify(candidate?.profile || {}, null, 2)}
          </pre>
        </section>
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Resume ↔ JD match</h2>
          <pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap text-sm text-[var(--muted)]">
            {JSON.stringify(match || { note: "No match stored yet" }, null, 2)}
          </pre>
        </section>
      </div>
    </DashboardShell>
  );
}
