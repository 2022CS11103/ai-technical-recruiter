"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  Settings,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearToken } from "@/lib/api";

const nav = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Interview builder", href: "/interviews/new", icon: BriefcaseBusiness },
  { label: "Interview results", href: "/results", icon: FileBarChart },
  { label: "Candidates", href: "/candidates", icon: Users },
  { label: "AI Interviewers", href: "/ai-interviewers", icon: PanelLeftClose },
  { label: "Question Library", href: "/question-library", icon: ClipboardList },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const active = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-svh bg-background text-foreground" data-testid="recruiter-app-shell">
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-sidebar transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[76px]" : "w-[248px]"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link href="/dashboard" className="flex items-center gap-2" data-testid="zara-logo-link">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              Z
            </span>
            {!collapsed && (
              <span className="font-mono text-[15px] font-semibold tracking-[0.28em]">ZARA</span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-testid="sidebar-collapse-button"
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-3 pt-5" aria-label="Main navigation">
          {nav.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                active(href)
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
              }`}
              data-testid={`nav-${label.toLowerCase().replaceAll(" ", "-")}`}
            >
              <Icon className="size-4" />
              {!collapsed && <span>{label}</span>}
              {!collapsed && active(href) && (
                <span className="ml-auto size-1.5 rounded-full bg-blue-400" />
              )}
            </Link>
          ))}
        </nav>

        {!collapsed && (
          <div className="border-t border-border p-3">
            <button
              className="mb-3 flex w-full items-center gap-3 rounded-md border border-border bg-muted/30 p-2 text-left"
              data-testid="workspace-selector-button"
            >
              <span className="grid size-7 place-items-center rounded bg-blue-500/15 text-xs font-semibold text-blue-300">
                ZL
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">Zara Labs</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  Technical hiring
                </span>
              </span>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </button>

            <div className="flex items-center gap-3 px-1">
              <img
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&q=80"
                alt="Ananya Sharma"
                className="size-8 rounded-full object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">Ananya Sharma</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  Head of Talent
                </span>
              </span>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  clearToken();
                  router.push("/login");
                }}
                aria-label="Sign out"
              >
                <Settings className="size-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="flex h-full w-[280px] flex-col border-r border-border bg-sidebar"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <span className="font-mono text-[15px] font-semibold tracking-[0.28em]">ZARA</span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                data-testid="mobile-sidebar-close-button"
              >
                <X />
              </Button>
            </div>
            <nav className="space-y-1 p-3 pt-5">
              {nav.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${
                    active(href) ? "bg-sidebar-accent text-foreground" : "text-muted-foreground"
                  }`}
                  data-testid={`mobile-nav-${label.toLowerCase().replaceAll(" ", "-")}`}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <main
        className={`min-h-svh transition-[margin] duration-200 ${
          collapsed ? "lg:ml-[76px]" : "lg:ml-[248px]"
        }`}
      >
        <div className="flex h-16 items-center border-b border-border px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            data-testid="mobile-sidebar-open-button"
          >
            <Menu />
          </Button>
          <span className="ml-3 font-mono text-sm font-semibold tracking-[0.24em]">ZARA</span>
        </div>
        {children}
      </main>
    </div>
  );
}
