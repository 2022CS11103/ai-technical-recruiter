"use client";

import {
  ArrowUpRight,
  BrainCircuit,
  Clock3,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/app/MetricCard";
import { PageHeader } from "@/components/app/PageHeader";
import { AppShell } from "@/components/app/AppShell";
import { activityData, scoreDistribution } from "@/data/mockData";

const roleData = [
  { name: "Backend", value: 42 },
  { name: "AI / ML", value: 28 },
  { name: "Frontend", value: 18 },
  { name: "Platform", value: 12 },
];

const COLORS = ["#60a5fa", "#a78bfa", "#34d399", "#fbbf24"];

export default function AnalyticsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] p-5 sm:p-8" data-testid="analytics-page">
        <PageHeader
          title="Analytics"
          description="See where your interview process is creating signal — and where candidates drop off."
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Interviews completed" value="142" detail="16.4%" trend="up" />
          <MetricCard
            label="Completion rate"
            value="82%"
            detail="4.8%"
            trend="up"
            accent="green"
          />
          <MetricCard
            label="Average score"
            value="7.8"
            detail="0.6%"
            trend="up"
            accent="violet"
          />
          <MetricCard
            label="Avg duration"
            value="26m"
            detail="2.1%"
            trend="down"
            accent="amber"
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card data-testid="analytics-completion-chart">
            <CardHeader>
              <CardTitle className="text-base">Interview completion trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData} margin={{ left: -20, right: 5 }}>
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
                      }}
                    />
                    <Bar dataKey="completed" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="analytics-role-chart">
            <CardHeader>
              <CardTitle className="text-base">Candidates by role</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-[280px] items-center gap-6">
                <div className="h-full w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={roleData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={88}
                        stroke="none"
                      >
                        {roleData.map((_, index) => (
                          <Cell key={index} fill={COLORS[index]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "#191d27",
                          border: "1px solid rgba(255,255,255,.1)",
                          borderRadius: 8,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {roleData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: COLORS[index] }}
                      />
                      <span className="text-muted-foreground">{item.name}</span>
                      <span className="ml-auto font-mono">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="analytics-score-chart">
            <CardHeader>
              <CardTitle className="text-base">Score distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scoreDistribution} margin={{ left: -20, right: 5 }}>
                    <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                    <XAxis
                      dataKey="band"
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
                      }}
                    />
                    <Bar dataKey="count" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="analytics-insights-card">
            <CardHeader>
              <CardTitle className="text-base">Signal from ZARA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(
                [
                  [
                    BrainCircuit,
                    "System design is the clearest gap",
                    "Most candidates lose signal when asked to reason about consistency and failure modes.",
                    "+12%",
                  ],
                  [
                    TrendingUp,
                    "Backend has the highest completion rate",
                    "Candidates finish backend screens 14% more often than the workspace average.",
                    "+14%",
                  ],
                  [
                    Clock3,
                    "Keep the first question warm",
                    "Sessions with a concrete scenario in the first 90 seconds have stronger completion.",
                    "Insight",
                  ],
                ] as const
              ).map(([Icon, title, text, badge]) => (
                <div key={title} className="flex gap-3 rounded-md border border-border p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded bg-blue-400/10 text-blue-300">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-xs text-emerald-300">
                    {badge}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-5">
            <Users className="size-4 text-blue-300" />
            <p className="mt-4 text-sm font-medium">Candidate throughput</p>
            <p className="mt-1 text-xs text-muted-foreground">186 screened this quarter</p>
            <span className="mt-4 flex items-center gap-1 text-xs text-emerald-300">
              View funnel
              <ArrowUpRight className="size-3" />
            </span>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <BrainCircuit className="size-4 text-violet-300" />
            <p className="mt-4 text-sm font-medium">Top skill gap</p>
            <p className="mt-1 text-xs text-muted-foreground">
              System design · 31% below target
            </p>
            <span className="mt-4 flex items-center gap-1 text-xs text-blue-300">
              Open library
              <ArrowUpRight className="size-3" />
            </span>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <Clock3 className="size-4 text-amber-300" />
            <p className="mt-4 text-sm font-medium">Time to signal</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Average first signal in 4m 12s
            </p>
            <span className="mt-4 flex items-center gap-1 text-xs text-blue-300">
              See patterns
              <ArrowUpRight className="size-3" />
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
