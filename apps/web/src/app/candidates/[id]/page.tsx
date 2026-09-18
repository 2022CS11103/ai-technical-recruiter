"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileText,
  MessageSquare,
  Plus,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { AppShell } from "@/components/app/AppShell";
import { candidates, evaluations, interviews } from "@/data/mockData";

export default function CandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id || "cand-01";

  const candidate = candidates.find((item) => item.id === id) ?? candidates[0];
  const campaign = interviews.find((item) => item.id === candidate.interviewId)!;

  const radar = Object.entries(candidate.skills).map(([subject, value]) => ({
    subject,
    score: value,
    fullMark: 10,
  }));

  return (
    <AppShell>
      <div
        className="mx-auto max-w-[1500px] p-5 sm:p-8"
        data-testid="candidate-detail-page"
      >
        <Link
          href="/candidates"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          data-testid="candidate-detail-back-link"
        >
          <ArrowLeft className="size-4" />
          Candidates
        </Link>

        <PageHeader
          eyebrow="CANDIDATE DOSSIER"
          title={candidate.name}
          description={`${candidate.role} · ${candidate.email}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => toast.success("Note added to candidate dossier")}
                data-testid="add-candidate-note-button"
              >
                <Plus className="size-4" />
                Add note
              </Button>
              <Button
                onClick={() => toast.success("Candidate moved forward")}
                data-testid="move-forward-button"
              >
                <CheckCircle2 className="size-4" />
                Move forward
              </Button>
            </div>
          }
        />

        <div className="mb-6 grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
          <Card className="overflow-visible">
            <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
              <img
                src={candidate.avatar}
                alt={candidate.name}
                className="size-20 rounded-full object-cover ring-4 ring-blue-400/10"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-medium">{candidate.name}</h2>
                  <StatusBadge status={candidate.recommendation} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Interviewed for {candidate.role} · {candidate.date}
                </p>
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    {candidate.date}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileText className="size-3.5" />
                    {campaign.name}
                  </span>
                </div>
              </div>
              <div className="border-t border-border pt-4 text-left sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0 sm:text-right">
                <p className="font-mono text-4xl font-semibold text-blue-300">
                  {candidate.score || "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Overall score / 10</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-400/20 bg-blue-500/[.05]">
            <CardContent className="p-6">
              <p className="flex items-center gap-2 text-xs font-medium text-blue-200">
                <Sparkles className="size-3.5" />
                ZARA recommendation
              </p>
              <p className="mt-3 text-2xl font-medium">{candidate.recommendation}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Based on technical depth, communication, and role fit across the complete
                interview.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[.7fr_1.3fr]">
          <Card data-testid="candidate-radar-card">
            <CardHeader className="border-b border-border/70">
              <CardTitle className="text-base">Competency map</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[290px]" data-testid="candidate-radar-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar} cx="50%" cy="50%" outerRadius="72%">
                    <PolarGrid stroke="rgba(255,255,255,.12)" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: "#a0aec0", fontSize: 11 }}
                    />
                    <Radar
                      dataKey="score"
                      stroke="#60a5fa"
                      fill="#3b82f6"
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="candidate-summary-card">
            <CardHeader className="border-b border-border/70">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-blue-300" />
                AI evaluation summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-5">
              <p className="text-sm leading-7 text-muted-foreground">{candidate.summary}</p>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <p className="mb-3 text-xs font-medium text-emerald-300">Strengths</p>
                  <ul className="space-y-2">
                    {candidate.strengths.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-3 text-xs font-medium text-amber-300">Areas to explore</p>
                  <ul className="space-y-2">
                    {candidate.areasToExplore.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-300" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6" data-testid="question-evaluations-card">
          <CardHeader className="border-b border-border/70">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Question-by-question evaluation</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Evidence-backed scoring from the full transcript.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  toast.info("Transcript export is available in the full product")
                }
                data-testid="export-transcript-button"
              >
                Export transcript
              </Button>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border/70 p-0">
            {evaluations.map((evaluation, index) => (
              <div
                key={evaluation.question}
                className="p-5 sm:p-6"
                data-testid={`evaluation-item-${index + 1}`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                  <div className="flex gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      0{index + 1}
                    </span>
                    <div>
                      <p className="font-medium">{evaluation.question}</p>
                      <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
                        <p className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <UserRound className="size-3" />
                          Candidate answer
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          “{evaluation.answer}”
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 self-start rounded-md bg-blue-400/10 px-3 py-2 font-mono text-sm text-blue-200">
                    {evaluation.score}/10
                  </span>
                </div>
                <div className="mt-4 grid gap-4 pl-7 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-blue-200">AI evaluation</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {evaluation.evaluation}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-emerald-200">Evidence</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {evaluation.evidence}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center gap-2 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          <MessageSquare className="size-4 text-blue-300" />
          Add a note to keep the hiring team aligned.
          <button
            className="ml-auto text-xs text-blue-300 hover:text-blue-200"
            onClick={() => toast.success("Note added")}
            data-testid="candidate-quick-note-button"
          >
            Add note
          </button>
        </div>
      </div>
    </AppShell>
  );
}
