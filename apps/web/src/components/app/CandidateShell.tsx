"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileUp,
  History,
  LayoutDashboard,
  Menu,
  Mic,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearToken } from "@/lib/api";

const nav = [
  { label: "Dashboard", href: "/portal", icon: LayoutDashboard },
  { label: "Profile", href: "/portal/profile", icon: UserRound },
  { label: "CV Upload", href: "/portal/cv", icon: FileUp },
  { label: "Interview history", href: "/portal/history", icon: History },
];

export function CandidateShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = (href: string) =>
    href === "/portal" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-svh bg-background text-foreground" data-testid="candidate-app-shell">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link href="/portal" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-emerald-500/20 text-xs font-bold text-emerald-200">
              C
            </span>
            <span className="font-mono text-[15px] font-semibold tracking-[0.28em]">ZARA</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3 pt-5">
          {nav.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${
                active(href)
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
          <Link
            href="/interview/try"
            className="mt-4 flex items-center gap-3 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-200"
          >
            <Mic className="size-4" />
            Start voice interview
          </Link>
        </nav>
        <div className="border-t border-border p-4">
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              clearToken();
              router.push("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="h-full w-[280px] border-r border-border bg-sidebar p-4" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)}>
              <X />
            </Button>
            <nav className="mt-4 space-y-1">
              {nav.map(({ label, href }) => (
                <Link key={href} href={href} onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-2 text-sm">
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}
      <main className="min-h-svh lg:ml-[248px]">
        <div className="flex h-16 items-center border-b border-border px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>
          <span className="ml-3 font-mono text-sm tracking-[0.24em]">CANDIDATE</span>
        </div>
        {children}
      </main>
    </div>
  );
}
