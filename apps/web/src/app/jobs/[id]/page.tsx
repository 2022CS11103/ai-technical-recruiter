"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

type Job = {
  id: string;
  title: string;
  raw_jd_text: string;
  profile?: Record<string, unknown>;
  competencies: { name: string; weight_pct: number }[];
};

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [resume, setResume] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<Job>(`/api/v1/jobs/${params.id}`).then(setJob).catch(() => setJob(null));
  }, [params.id]);

  async function addCandidate(e: FormEvent) {
    e.preventDefault();
    const cand = await api<{ id: string }>(`/api/v1/jobs/${params.id}/candidates`, {
      method: "POST",
      body: JSON.stringify({ full_name: candidateName, raw_resume_text: resume }),
    });
    const interview = await api<{ id: string; interview_url_token?: string }>("/api/v1/interviews", {
      method: "POST",
      body: JSON.stringify({ job_id: params.id, candidate_id: cand.id }),
    });
    setInviteToken(interview.interview_url_token || "");
    setMessage(`Candidate added. Interview ${interview.id} created.`);
  }

  if (!job) {
    return (
      <DashboardShell>
        <p className="text-[var(--muted)]">Loading job…</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">{job.title}</h1>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Extracted JD</h2>
          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap text-sm text-[var(--muted)]">
            {JSON.stringify(job.profile || { note: "No profile yet" }, null, 2)}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            {job.competencies.map((c) => (
              <span key={c.name} className="rounded-full border border-[var(--line)] px-3 py-1 text-sm">
                {c.name} {c.weight_pct}%
              </span>
            ))}
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Add candidate + invite</h2>
          <form onSubmit={addCandidate} className="mt-4 grid gap-3">
            <input className="input" placeholder="Candidate name" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} />
            <textarea
              className="input min-h-48"
              placeholder="Paste resume text"
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              required
            />
            <button className="btn btn-primary w-fit">Parse resume, match JD, create interview</button>
          </form>
          {message && <p className="mt-3 text-[var(--ok)]">{message}</p>}
          {inviteToken && (
            <p className="mt-3 break-all text-sm text-[var(--muted)]">
              Candidate link: <a href={`/interview/${inviteToken}`}>/interview/{inviteToken}</a>
            </p>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
