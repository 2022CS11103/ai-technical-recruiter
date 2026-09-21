"use client";

import { useEffect, useMemo, useState } from "react";
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
import { api } from "@/lib/api";

type PlanCompetency = {
  name?: string;
  why?: string;
  claim?: string;
  probe_levels?: string[];
};

type Dossier = {
  candidate_id: string;
  session_id: string;
  status: string;
  name: string;
  email: string;
  role: string;
  date?: string;
  plan?: { competencies?: PlanCompetency[]; claims?: string[]; gaps?: string[] };
  overall_score: number;
  recommendation: string;
  strengths: string[];
  weaknesses: string[];
  evidence: string[];
  resume_validation: Array<{ claim?: string; status?: string } | string>;
  technical_gaps: string[];
  recommended_next_step: string;
  competency_scores: Record<string, number>;
  competency_evidence: Record<string, string[]>;
  evidence_log: Array<{
    competency?: string;
    question?: string;
    answer?: string;
    score_0_to_5?: number;
    status?: string;
    evidence?: string[];
    missing_points?: string[];
  }>;
  evaluations: Array<{
    question: string;
    answer: string;
    competency?: string;
    score?: number | null;
    evaluation?: string;
    evidence?: string[] | string;
    missing_points?: string[];
    status?: string;
  }>;
  conversation_history: Array<{ role?: string; content?: string }>;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "C";
}

function asList(value: string[] | string | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function scoreToFive(score100: number) {
  return Math.round((score100 / 20) * 10) / 10;
}

export default function CandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id || "";
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api<Dossier>(`/api/v1/dossiers/${id}`, { auth: false })
      .then((data) => {
        if (!cancelled) setDossier(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Dossier not found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const overall10 = dossier ? Math.round(((dossier.overall_score || 0) / 10) * 10) / 10 : 0;
  const radar = useMemo(
    () =>
      Object.entries(dossier?.competency_scores || {}).map(([subject, value]) => ({
        subject,
        score: Math.round((Number(value) / 10) * 10) / 10,
        fullMark: 10,
      })),
    [dossier]
  );

  const evaluations =
    dossier?.evaluations?.length
      ? dossier.evaluations
      : (dossier?.evidence_log || []).map((row) => ({
          question: row.question || "",
          answer: row.answer || "",
          competency: row.competency,
          score: row.score_0_to_5,
          evaluation: (row.missing_points || []).join(", "),
          evidence: row.evidence,
          missing_points: row.missing_points,
          status: row.status,
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

        {loading && (
          <p className="text-sm text-muted-foreground">Loading live dossier…</p>
        )}
        {!loading && error && (
          <Card>
            <CardContent className="p-8 text-sm text-muted-foreground">
              {error}. Run a live interview first, then open this page from Candidates.
            </CardContent>
          </Card>
        )}

        {dossier && (
          <>
            <PageHeader
              eyebrow="CANDIDATE DOSSIER"
              title={dossier.name}
              description={`${dossier.role} · ${dossier.email || "No email on resume"}`}
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
                  <span className="grid size-20 place-items-center rounded-full bg-blue-500/15 text-lg font-medium text-blue-200 ring-4 ring-blue-400/10">
                    {initials(dossier.name)}
                  </span>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-medium">{dossier.name}</h2>
                      <StatusBadge status={dossier.recommendation} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Interviewed for {dossier.role} · {dossier.date || "Live session"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        {dossier.date || "Today"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <FileText className="size-3.5" />
                        {dossier.status === "completed" ? "Completed interview" : "In progress"}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-border pt-4 text-left sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0 sm:text-right">
                    <p className="font-mono text-4xl font-semibold text-blue-300">
                      {overall10 || "—"}
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
                  <p className="mt-3 text-2xl font-medium">{dossier.recommendation}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {dossier.recommended_next_step ||
                      "Advisory only. Review the evidence table before any hiring decision."}
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
                  {radar.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                      Scores appear after answers are evaluated.
                    </p>
                  ) : (
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
                  )}
                </CardContent>
              </Card>

              <Card data-testid="candidate-summary-card">
                <CardHeader className="border-b border-border/70">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="size-4 text-blue-300" />
                    Evidence-based scores
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-[10px] uppercase tracking-[.15em] text-muted-foreground">
                        <tr>
                          <th className="pb-3 pr-4">Competency</th>
                          <th className="pb-3 pr-4">Score</th>
                          <th className="pb-3">Evidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {Object.entries(dossier.competency_scores || {}).map(([name, score]) => (
                          <tr key={name}>
                            <td className="py-3 pr-4 font-medium">{name}</td>
                            <td className="py-3 pr-4 font-mono text-blue-200">
                              {scoreToFive(Number(score))}/5
                            </td>
                            <td className="py-3 text-muted-foreground">
                              {(dossier.competency_evidence?.[name] || []).join(" · ") ||
                                "No technical quote captured"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {Object.keys(dossier.competency_scores || {}).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No scored competencies yet. Finish the interview to populate this table.
                    </p>
                  )}
                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <p className="mb-3 text-xs font-medium text-emerald-300">Strengths</p>
                      <ul className="space-y-2">
                        {(dossier.strengths || []).map((item) => (
                          <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-400" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-3 text-xs font-medium text-amber-300">Gaps / missing evidence</p>
                      <ul className="space-y-2">
                        {(dossier.weaknesses?.length ? dossier.weaknesses : dossier.technical_gaps || []).map(
                          (item) => (
                            <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-300" />
                              {item}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6">
              <CardHeader className="border-b border-border/70">
                <CardTitle className="text-base">Interview plan</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Generated from the JD and resume before the first question.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                {(dossier.plan?.competencies || []).map((comp) => (
                  <div key={comp.name} className="rounded-md border border-border/70 p-4">
                    <p className="font-medium">{comp.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{comp.why}</p>
                    {comp.claim && (
                      <p className="mt-2 text-sm text-blue-200">Claim to test: {comp.claim}</p>
                    )}
                  </div>
                ))}
                {(dossier.plan?.competencies || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No stored plan for this session.</p>
                )}
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader className="border-b border-border/70">
                <CardTitle className="text-base">Resume claim verification</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border/70 p-0">
                {(dossier.resume_validation || []).length === 0 && (
                  <p className="p-6 text-sm text-muted-foreground">
                    Claims are marked supported, weak, or unverified as probes complete.
                  </p>
                )}
                {(dossier.resume_validation || []).map((item, index) => {
                  const claim = typeof item === "string" ? item : item.claim || "Claim";
                  const status = typeof item === "string" ? "" : item.status || "";
                  return (
                    <div key={`${claim}-${index}`} className="flex items-center justify-between gap-4 p-5">
                      <p className="text-sm">{claim}</p>
                      <StatusBadge status={status || "unverified"} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="mt-6" data-testid="question-evaluations-card">
              <CardHeader className="border-b border-border/70">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Question-by-question evaluation</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Evidence-backed scoring from the live transcript.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toast.info("Copy the evidence table for the hiring team")}
                    data-testid="export-transcript-button"
                  >
                    Export transcript
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-border/70 p-0">
                {evaluations.length === 0 && (
                  <p className="p-6 text-sm text-muted-foreground">
                    No evaluated answers yet.
                  </p>
                )}
                {evaluations.map((evaluation, index) => (
                  <div
                    key={`${evaluation.question}-${index}`}
                    className="p-5 sm:p-6"
                    data-testid={`evaluation-item-${index + 1}`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                      <div className="flex gap-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {String(index + 1).padStart(2, "0")}
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
                        {evaluation.score != null ? `${evaluation.score}/5` : "—"}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-4 pl-7 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-blue-200">Missing evidence</p>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {evaluation.evaluation ||
                            asList(evaluation.missing_points).join(", ") ||
                            "—"}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-emerald-200">Evidence</p>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {asList(evaluation.evidence).join(" · ") || "No quote captured"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="mt-6 flex items-center gap-2 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
              <MessageSquare className="size-4 text-blue-300" />
              Recruiter review is required — this is evidence, not a hiring decision.
              <button
                className="ml-auto text-xs text-blue-300 hover:text-blue-200"
                onClick={() => toast.success("Note added")}
                data-testid="candidate-quick-note-button"
              >
                Add note
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
