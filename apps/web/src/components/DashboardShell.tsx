"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/candidates", label: "Candidates" },
  { href: "/interviews", label: "Interviews" },
  { href: "/reports", label: "Reports" },
  { href: "/questions", label: "Question Bank" },
  { href: "/knowledge", label: "Knowledge Base" },
  { href: "/settings", label: "Settings" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-[var(--line)] lg:border-b-0 lg:border-r lg:min-h-screen p-5 bg-[color-mix(in_oklab,var(--bg-elevated)_80%,transparent)]">
        <Link href="/" className="font-display text-xl font-700 tracking-tight">
          AI Technical Recruiter
        </Link>
        <p className="mt-1 text-sm text-[var(--muted)]">Recruiter workspace</p>
        <nav className="mt-8 grid gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-2 text-sm transition ${
                  active ? "bg-[var(--accent)] text-[#04201c] font-semibold" : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          className="mt-8 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
          onClick={() => {
            clearToken();
            router.push("/login");
          }}
        >
          Sign out
        </button>
      </aside>
      <main className="p-6 lg:p-10">{children}</main>
    </div>
  );
}
