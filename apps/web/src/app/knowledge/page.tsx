"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { api, API_URL, getToken } from "@/lib/api";

export default function KnowledgePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");

  async function refresh() {
    setRows(await api("/api/v1/knowledge"));
  }
  useEffect(() => {
    refresh().catch(() => setRows([]));
  }, []);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("document_type", "knowledge");
    const res = await fetch(`${API_URL}/api/v1/documents/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    if (!res.ok) throw new Error("Upload failed");
    const doc = await res.json();
    await api("/api/v1/knowledge/upload", {
      method: "POST",
      body: JSON.stringify({ document_id: doc.id, title: file.name, knowledge_type: "guideline" }),
    });
    setMsg("Document ingested into pgvector knowledge base.");
    setFile(null);
    await refresh();
  }

  return (
    <DashboardShell>
      <h1 className="font-display text-4xl">Knowledge base</h1>
      <p className="mt-2 text-[var(--muted)]">Handbooks, guidelines, and role docs for grounded RAG answers.</p>
      <form onSubmit={onUpload} className="panel mt-8 grid max-w-xl gap-3 p-5">
        <input type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="btn btn-primary w-fit">Upload & embed</button>
        {msg && <p className="text-sm text-[var(--ok)]">{msg}</p>}
      </form>
      <div className="mt-6 grid gap-3">
        {rows.map((r) => (
          <div key={r.id} className="panel p-4">
            <p className="font-semibold">{r.title}</p>
            <p className="text-sm text-[var(--muted)]">{r.knowledge_type}</p>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
