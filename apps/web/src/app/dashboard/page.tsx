"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  ChevronRight,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/PageHeader";
import { MetricCard } from "@/components/app/MetricCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InterviewerAvatar } from "@/components/app/InterviewerAvatar";
import { AppShell } from "@/components/app/AppShell";
import {
  activityData,
  candidates,
  interviews,
  interviewers,
} from "@/data/mockData";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] p-5 sm:p-8" data-testid="dashboard-page">
        <PageHeader
          eyebrow="Tuesday, October 22, 2024"
          title="Good morning, Ananya"
          description="Here's what's happening with your interviews."
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
          <MetricCard label="Active interviews" value="24" detail="12.5%" trend="up" />
          <MetricCard
            label="Candidates screened"
            value="186"
            detail="18.2%"
            trend="up"
            accent="green"
          />
          <MetricCard
            label="Completion rate"
            value="82%"
            detail="4.8%"
            trend="up"
            accent="violet"
          />
          <MetricCard
            label="Average score"
            value="7.8/10"
            detail="0.6%"
            trend="up"
            accent="amber"
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
          <Card data-testid="interview-activity-card">
            <CardHeader className="border-b border-border/70">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">Interview activity</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Completed sessions over the last 7 days
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Live data
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[270px]" data-testid="interview-activity-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={activityData}
                    margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#6d7a91", fontSize: 11 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#6d7a91", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#191d27",
                        border: "1px solid rgba(255,255,255,.1)",
                        borderRadius: 8,
                        color: "#fff",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="invited"
                      stroke="#60708c"
                      strokeWidth={1.5}
                      fill="transparent"
                      strokeDasharray="4 4"
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      fill="url(#activityFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="recent-evaluations-card">
            <CardHeader className="border-b border-border/70">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent evaluations</CardTitle>
                <Link
                  href="/candidates"
                  className="text-xs text-blue-400 hover:text-blue-300"
                  data-testid="view-all-candidates-link"
                >
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-border/70 p-0">
              {candidates.slice(0, 4).map((candidate) => (
                <Link
                  href={`/candidates/${candidate.id}`}
                  key={candidate.id}
                  className="flex items-center gap-3 px-5 py-4 hover:bg-muted/30"
                  data-testid={`evaluation-${candidate.id}`}
                >
                  <img
                    src={candidate.avatar}
                    alt=""
                    className="size-9 rounded-full object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {candidate.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {candidate.role}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-sm font-semibold">
                      {candidate.score ? `${candidate.score}/10` : "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {candidate.date}
                    </span>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6" data-testid="recent-interviews-card">
          <CardHeader className="border-b border-border/70">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent interviews</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your active campaigns and latest candidate activity
                </p>
              </div>
              <Link
                href="/interviews"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                data-testid="view-all-interviews-link"
              >
                View all
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="border-b border-border/70 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Candidate</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Interview</th>
                    <th className="px-5 py-3 font-medium">Score</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {candidates.slice(0, 5).map((candidate, index) => {
                    const campaign = interviews[index % interviews.length];
                    const interviewer = interviewers.find(
                      (item) => item.id === campaign.interviewerId
                    )!;

                    return (
                      <tr
                        key={candidate.id}
                        className="group hover:bg-muted/20"
                        data-testid={`recent-interview-row-${candidate.id}`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={candidate.avatar}
                              alt=""
                              className="size-8 rounded-full object-cover"
                            />
                            <span className="text-sm font-medium">{candidate.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">
                          {candidate.role}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-sm">
                            <InterviewerAvatar interviewer={interviewer} size="sm" />
                            {campaign.name}
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono text-sm">
                          {candidate.score ? `${candidate.score}/10` : "—"}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={candidate.status} />
                        </td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">
                          {candidate.date}
                        </td>
                        <td className="px-5 py-4">
                          <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Link
            href="/interviews/new"
            className="group relative overflow-hidden rounded-lg border border-blue-400/20 bg-blue-500/[.07] p-5"
            data-testid="dashboard-create-card"
          >
            <div className="absolute -right-10 -top-10 size-36 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="relative flex items-start justify-between">
              <div>
                <span className="mb-4 grid size-9 place-items-center rounded-md bg-blue-500/15 text-blue-300">
                  <Plus className="size-4" />
                </span>
                <h3 className="font-medium">Build a new interview</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set the role, interviewer, and evaluation rubric.
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
            <h3 className="font-medium">Preview the candidate room</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Experience the voice-first flow your candidates see.
            </p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
