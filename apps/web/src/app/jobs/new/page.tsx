"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

const DEFAULT_COMPS = [
  { name: "Python", weight_pct: 15 },
  { name: "Backend", weight_pct: 15 },
  { name: "LLMs", weight_pct: 20 },
  { name: "RAG", weight_pct: 20 },
  { name: "System Design", weight_pct: 20 },
  { name: "Communication", weight_pct: 10 },
];

export default function NewJobPage() {
  const router = useRouter();
  const [title, setTitle] = useState("AI Engineer");
  const [jd, setJd] = useState("");
  const [duration, setDuration] = useState(30);
  const [difficulty, setDifficulty] = useState("adaptive");
  const [style, setStyle] = useState("ai_engineer");
  const [competencies, setCompetencies] = useState(DEFAULT_COMPS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const total = competencies.reduce((s, c) => s + Number(c.weight_pct || 0), 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (Math.abs(total - 100) > 0.01) {
      setError("Competency weights must total 100%");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const job = await api<{ id: string }>("/api/v1/jobs", {
        method: "POST",
        body: JSON.stringify({
          title,
          raw_jd_text: jd,
          interview_duration_minutes: duration,
          difficulty,
          interview_style: style,
          competencies,
        }),
      });
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">Create job</h1>
      <p className="mt-2 text-[var(--muted)]">Upload or paste a JD, then configure the interview.</p>
      <form onSubmit={onSubmit} className="mt-8 grid max-w-3xl gap-5">
        <div>
          <label className="label">Job title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">Job description (paste text)</label>
          <textarea className="input min-h-48" value={jd} onChange={(e) => setJd(e.target.value)} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Duration</label>
            <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[15, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Difficulty</label>
            <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              {["easy", "medium", "hard", "adaptive"].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Style</label>
            <select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
              {["technical", "technical_behavioral", "system_design", "ai_engineer", "backend", "fullstack", "custom"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                )
              )}
            </select>
          </div>
        </div>
        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Competency weights</h2>
            <span className={total === 100 ? "text-[var(--ok)]" : "text-[var(--danger)]"}>{total}%</span>
          </div>
          <div className="mt-4 grid gap-3">
            {competencies.map((c, i) => (
              <div key={c.name} className="grid grid-cols-[1fr_100px] gap-3">
                <input
                  className="input"
                  value={c.name}
                  onChange={(e) => {
                    const next = [...competencies];
                    next[i] = { ...next[i], name: e.target.value };
                    setCompetencies(next);
                  }}
                />
                <input
                  className="input"
                  type="number"
                  value={c.weight_pct}
                  onChange={(e) => {
                    const next = [...competencies];
                    next[i] = { ...next[i], weight_pct: Number(e.target.value) };
                    setCompetencies(next);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        {error && <p className="text-[var(--danger)]">{error}</p>}
        <button className="btn btn-primary w-fit" disabled={loading}>
          {loading ? "Creating…" : "Create job & parse JD"}
        </button>
      </form>
    </DashboardShell>
  );
}
