"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  ChevronRight,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/PageHeader";
import { MetricCard } from "@/components/app/MetricCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { AppShell } from "@/components/app/AppShell";
import { api } from "@/lib/api";

type Overview = {
  active_jobs: number;
  upcoming_interviews: number;
  completed_interviews: number;
  candidates: number;
  average_score: number;
  interviews_needing_review: number;
};

type ResultRow = {
  id: string;
  name: string;
  role: string;
  score: number | null;
  status: string;
  recommendation: string;
  date: string;
};

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);

  useEffect(() => {
    api<Overview>("/api/v1/dashboard/overview").then(setOverview).catch(() => setOverview(null));
    api<ResultRow[]>("/api/v1/dossiers/recent", { auth: false }).then(setRows).catch(() => setRows([]));
  }, []);

  const avg10 = overview ? Math.round(((overview.average_score || 0) / 10) * 10) / 10 : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] p-5 sm:p-8" data-testid="dashboard-page">
        <PageHeader
          eyebrow="RECRUITER WORKSPACE"
          title="Interview operations"
          description="Plan interviews and review evidence dossiers."
          action={
            <Link href="/interviews/new" data-testid="dashboard-create-interview-link">
              <Button size="lg">
                <Plus className="size-4" />
                Create Interview
              </Button>
            </Link>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Completed interviews"
            value={String(overview?.completed_interviews ?? "—")}
            detail="live"
            trend="up"
          />
          <MetricCard
            label="Candidates screened"
            value={String(overview?.candidates ?? "—")}
            detail="workspace"
            trend="up"
            accent="green"
          />
          <MetricCard
            label="Needs review"
            value={String(overview?.interviews_needing_review ?? "—")}
            detail="dossiers"
            trend="up"
            accent="violet"
          />
          <MetricCard
            label="Active jobs"
            value={String(overview?.active_jobs ?? "—")}
            detail="open"
            trend="up"
            accent="amber"
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
          <Card data-testid="recent-interviews-card">
            <CardHeader className="border-b border-border/70">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Interview results</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Live evidence from ZARA sessions
                  </p>
                </div>
                <Link href="/results" className="flex items-center gap-1 text-xs text-blue-400">
                  View all
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-border/60 p-0">
              {rows.slice(0, 6).map((row) => (
                <Link
                  key={row.id}
                  href={`/candidates/${row.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-muted/20"
                >
                  <span>
                    <span className="block text-sm font-medium">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.role} · {row.date}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-sm">
                      {row.score ? `${row.score}/10` : "—"}
                    </span>
                    <StatusBadge status={row.status} />
                  </span>
                </Link>
              ))}
              {rows.length === 0 && (
                <p className="p-8 text-sm text-muted-foreground">
                  No live interviews yet. Create a campaign or run a candidate session.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border/70">
              <CardTitle className="text-base">Workspace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5 text-sm">
              <p className="text-muted-foreground">
                Average score {avg10 || "—"}/10 · {overview?.upcoming_interviews ?? 0} scheduled
              </p>
              <Link href="/results" className="block rounded-md border border-border p-3 hover:border-blue-400/40">
                Interview results
              </Link>
              <Link href="/interviews/new" className="block rounded-md border border-border p-3 hover:border-blue-400/40">
                Interview builder
              </Link>
              <Link href="/candidates" className="block rounded-md border border-border p-3 hover:border-blue-400/40">
                Candidate dossiers
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Link
            href="/interviews/new"
            className="group relative overflow-hidden rounded-lg border border-blue-400/20 bg-blue-500/[.07] p-5"
            data-testid="dashboard-create-card"
          >
            <div className="relative flex items-start justify-between">
              <div>
                <span className="mb-4 grid size-9 place-items-center rounded-md bg-blue-500/15 text-blue-300">
                  <Plus className="size-4" />
                </span>
                <h3 className="font-medium">Build a new interview</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  JD, interviewer, and evaluation plan before the first question.
                </p>
              </div>
              <ChevronRight className="size-4 text-blue-300 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/interview/try"
            className="group rounded-lg border border-border bg-card p-5 hover:border-blue-400/30"
            data-testid="dashboard-preview-room-card"
          >
            <div className="flex items-start justify-between">
              <span className="mb-4 grid size-9 place-items-center rounded-md bg-emerald-500/10 text-emerald-300">
                <Bot className="size-4" />
              </span>
              <Sparkles className="size-4 text-muted-foreground" />
            </div>
            <h3 className="font-medium">Candidate voice room</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              STT → planner/evaluator → browser TTS. No credits required.
            </p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
