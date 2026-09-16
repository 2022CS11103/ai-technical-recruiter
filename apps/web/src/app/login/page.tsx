"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

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
      const res = await api<{ access_token: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        auth: false,
      });
      setToken(res.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="font-display text-2xl font-700">
        AI Technical Recruiter
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Sign in</h1>
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
      <p className="mt-4 text-sm text-[var(--muted)]">
        No account? <Link href="/register">Register</Link>
      </p>
    </div>
  );
}
