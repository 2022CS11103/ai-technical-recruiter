"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

export default function QuestionsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [question, setQuestion] = useState("");
  const [competency, setCompetency] = useState("RAG");
  const [mandatory, setMandatory] = useState(false);

  async function refresh() {
    setRows(await api("/api/v1/questions"));
  }
  useEffect(() => {
    refresh().catch(() => setRows([]));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await api("/api/v1/questions", {
      method: "POST",
      body: JSON.stringify({
        question,
        competency,
        difficulty: "hard",
        expected_concepts: ["chunking", "embeddings", "retrieval", "reranking", "evaluation"],
        mandatory,
      }),
    });
    setQuestion("");
    await refresh();
  }

  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">Question bank</h1>
      <form onSubmit={onSubmit} className="panel mt-8 grid max-w-2xl gap-3 p-5">
        <textarea className="input min-h-28" value={question} onChange={(e) => setQuestion(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <input className="input" value={competency} onChange={(e) => setCompetency(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> Mandatory
          </label>
        </div>
        <button className="btn btn-primary w-fit">Add question</button>
      </form>
      <div className="mt-6 grid gap-3">
        {rows.map((q) => (
          <div key={q.id} className="panel p-4">
            <p>{q.question}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {q.competency} · {q.difficulty} {q.mandatory ? "· mandatory" : ""}
            </p>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
