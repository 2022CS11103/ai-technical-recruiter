"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

type ReportData = {
  overall_score?: number | string;
  recommendation?: string;
  human_override?: string;
  strengths?: string[];
  weaknesses?: string[];
  evidence?: string[];
  resume_validation?: unknown;
  recommended_next_step?: string;
  full_report?: { competency_scores?: Record<string, number | string> };
};

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportData | null>(null);
  const [override, setOverride] = useState("yes");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<ReportData>(`/api/v1/reports/${params.id}`).then(setReport).catch(() => setReport(null));
  }, [params.id]);

  async function onOverride(e: FormEvent) {
    e.preventDefault();
    await api(`/api/v1/reports/${params.id}/override`, {
      method: "POST",
      body: JSON.stringify({ human_override: override, recruiter_notes: notes }),
    });
    setMsg("Override saved. Final hiring decisions remain with humans.");
    const refreshed = await api<ReportData>(`/api/v1/reports/${params.id}`);
    setReport(refreshed);
  }

  if (!report) {
    return (
      <DashboardShell>
        <p className="text-[var(--muted)]">Loading report…</p>
      </DashboardShell>
    );
  }

  const scores = report.full_report?.competency_scores || {};

  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">Interview report</h1>
      <p className="mt-2 text-[var(--muted)]">Evidence-based evaluation · human oversight required</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="text-sm text-[var(--muted)]">Overall</p>
          <p className="font-display text-5xl">{report.overall_score}</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-[var(--muted)]">AI recommendation</p>
          <p className="font-display text-3xl">{report.recommendation}</p>
        </div>
        <div className="panel p-5">
          <p className="text-sm text-[var(--muted)]">Human override</p>
          <p className="font-display text-3xl">{report.human_override || "—"}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Competency breakdown</h2>
          <div className="mt-4 space-y-3">
            {Object.entries(scores).map(([name, score]) => (
              <div key={name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{name}</span>
                  <span>{String(score)}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--line)]">
                  <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, Number(score))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Strengths & weaknesses</h2>
          <p className="mt-3 text-sm text-[var(--ok)]">{(report.strengths || []).join(" · ")}</p>
          <p className="mt-3 text-sm text-[var(--danger)]">{(report.weaknesses || []).join(" · ")}</p>
          <h3 className="mt-6 font-semibold">Evidence</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-[var(--muted)]">
            {(report.evidence || []).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Resume validation</h2>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted)]">
            {JSON.stringify(report.resume_validation || [], null, 2)}
          </pre>
        </section>
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Recruiter decision</h2>
          <form onSubmit={onOverride} className="mt-4 grid gap-3">
            <select className="input" value={override} onChange={(e) => setOverride(e.target.value)}>
              {["strong_yes", "yes", "maybe", "no"].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <textarea className="input min-h-28" placeholder="Notes (not shown to candidate)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button className="btn btn-primary w-fit">Save override</button>
          </form>
          {msg && <p className="mt-3 text-[var(--ok)]">{msg}</p>}
          <p className="mt-4 text-sm text-[var(--muted)]">{report.recommended_next_step}</p>
        </section>
      </div>
    </DashboardShell>
  );
}
