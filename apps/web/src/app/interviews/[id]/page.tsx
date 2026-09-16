"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

export default function InterviewDetailPage() {
  const params = useParams<{ id: string }>();
  const [interview, setInterview] = useState<Record<string, unknown> | null>(null);
  const [transcript, setTranscript] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api(`/api/v1/interviews/${params.id}`).then(setInterview).catch(() => null);
    api(`/api/v1/interviews/${params.id}/transcript`).then(setTranscript).catch(() => null);
    api(`/api/v1/interviews/${params.id}/report`).then(setReport).catch(() => null);
  }, [params.id]);

  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">Interview</h1>
      <p className="mt-2 text-[var(--muted)]">{String(interview?.status || "loading")}</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Transcript</h2>
          <pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap text-sm text-[var(--muted)]">
            {JSON.stringify(transcript || {}, null, 2)}
          </pre>
        </section>
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Report snapshot</h2>
          {report ? (
            <div className="mt-4 space-y-3 text-sm">
              <p className="font-display text-4xl">{String(report.overall_score)}</p>
              <p>Recommendation: {String(report.recommendation)}</p>
              <p className="text-[var(--muted)]">{JSON.stringify(report.strengths)}</p>
              <a className="text-[var(--accent)]" href={`/reports/${report.id}`}>
                Open full report
              </a>
            </div>
          ) : (
            <p className="mt-4 text-[var(--muted)]">No report yet. Finish the interview to generate one.</p>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
