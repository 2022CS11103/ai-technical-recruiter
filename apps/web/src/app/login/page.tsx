"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, homeForRole, setRole, setToken } from "@/lib/api";

const demos = [
  { label: "Recruiter", email: "recruiter@example.com", hint: "Workspace, credits, dossiers" },
  { label: "Candidate", email: "candidate@example.com", hint: "CV, voice interview, feedback" },
  { label: "Admin", email: "admin@example.com", hint: "Users, monitoring, ban" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("recruiter@example.com");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ access_token: string; role?: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        auth: false,
      });
      setToken(res.access_token);
      setRole(res.role || "recruiter");
      router.push(homeForRole(res.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="font-mono text-sm tracking-[0.28em]">
        ZARA
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Recruiter, candidate, and admin each land in their own workspace.
      </p>
      <form onSubmit={onSubmit} className="panel mt-6 grid gap-4 p-6">
        <div>
          <label className="label">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="mt-6 grid gap-2">
        {demos.map((demo) => (
          <button
            key={demo.email}
            type="button"
            className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left text-sm"
            onClick={() => {
              setEmail(demo.email);
              setPassword("demo1234");
            }}
          >
            <span>{demo.label}</span>
            <span className="text-xs text-muted-foreground">{demo.hint}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">
        No account? <Link href="/register">Register</Link>
      </p>
    </div>
  );
}
