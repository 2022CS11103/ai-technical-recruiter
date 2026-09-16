"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ access_token: string }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, full_name: fullName, company_name: companyName || "My Company" }),
        auth: false,
      });
      setToken(res.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="font-display text-2xl font-700">
        AI Technical Recruiter
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Create your workspace</h1>
      <form onSubmit={onSubmit} className="panel mt-6 grid gap-4 p-6">
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Company</label>
          <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create Interview workspace"}
        </button>
      </form>
    </div>
  );
}
