"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FileText,
  Mic2,
  Play,
  Settings2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InterviewerAvatar } from "@/components/app/InterviewerAvatar";
import { AppShell } from "@/components/app/AppShell";
import { candidates, interviews, interviewers } from "@/data/mockData";

export default function InterviewDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id || "backend-7x92";

  const interview = interviews.find((item) => item.id === id) ?? interviews[0];
  const interviewer = interviewers.find((item) => item.id === interview.interviewerId)!;
  const assigned = candidates.filter((candidate) => candidate.interviewId === interview.id);

  const copy = async () => {
    await navigator.clipboard?.writeText(
      `${window.location.origin}/interview/${interview.id}`
    );
    toast.success("Candidate link copied");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] p-5 sm:p-8" data-testid="interview-detail-page">
        <Link
          href="/interviews"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          data-testid="interview-detail-back-link"
        >
          <ArrowLeft className="size-4" />
          All interviews
        </Link>

        <PageHeader
          eyebrow="INTERVIEW CAMPAIGN"
          title={interview.name}
          description={`${interview.role} · ${interview.company}`}
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={copy} data-testid="campaign-copy-link-button">
                <Copy className="size-4" />
                Copy link
              </Button>
              <Link href="/interview/try" data-testid="campaign-preview-link">
                <Button>
                  <Play className="size-4" />
                  Preview room
                </Button>
              </Link>
            </div>
          }
        />

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <Users className="size-4 text-blue-300" />
            <p className="mt-4 font-mono text-2xl">{interview.candidates}</p>
            <p className="text-xs text-muted-foreground">Candidates invited</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <Mic2 className="size-4 text-emerald-300" />
            <p className="mt-4 font-mono text-2xl">{interview.completion}%</p>
            <p className="text-xs text-muted-foreground">Completion rate</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <FileText className="size-4 text-violet-300" />
            <p className="mt-4 font-mono text-2xl">{interview.questions}</p>
            <p className="text-xs text-muted-foreground">Questions per session</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <Settings2 className="size-4 text-amber-300" />
            <p className="mt-4 font-mono text-2xl">{interview.score}/10</p>
            <p className="text-xs text-muted-foreground">Average score</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
          <Card data-testid="campaign-candidates-card">
            <CardHeader className="border-b border-border/70">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Candidate pipeline</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Every response, scored by ZARA
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.success("Invitation flow opened")}
                  data-testid="invite-candidate-button"
                >
                  Invite candidate
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left">
                  <thead className="border-b border-border/70 text-[10px] uppercase tracking-[.15em] text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3">Candidate</th>
                      <th className="px-5 py-3">Score</th>
                      <th className="px-5 py-3">Recommendation</th>
                      <th className="px-5 py-3">Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {assigned.length ? (
                      assigned.map((candidate) => (
                        <tr key={candidate.id} className="group">
                          <td className="px-5 py-4">
                            <Link
                              href={`/candidates/${candidate.id}`}
                              className="flex items-center gap-3"
                              data-testid={`campaign-candidate-link-${candidate.id}`}
                            >
                              <img
                                src={candidate.avatar}
                                alt=""
                                className="size-8 rounded-full object-cover"
                              />
                              <span>
                                <span className="block text-sm font-medium">
                                  {candidate.name}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {candidate.email}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="px-5 py-4 font-mono text-sm">
                            {candidate.score ? `${candidate.score}/10` : "—"}
                          </td>
                          <td className="px-5 py-4 text-sm text-muted-foreground">
                            {candidate.score
                              ? candidate.recommendation
                              : "Awaiting interview"}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge status={candidate.status} />
                          </td>
                          <td className="px-5 py-4">
                            <Link
                              href={`/candidates/${candidate.id}`}
                              className="text-xs text-blue-400 opacity-0 group-hover:opacity-100"
                              data-testid={`campaign-view-candidate-${candidate.id}`}
                            >
                              View dossier
                            </Link>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          className="p-10 text-center text-sm text-muted-foreground"
                        >
                          No candidates assigned yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="border-b border-border/70">
                <CardTitle className="text-base">AI interviewer</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3 pt-5">
                <InterviewerAvatar interviewer={interviewer} />
                <div>
                  <p className="font-medium">{interviewer.name}</p>
                  <p className="text-xs text-muted-foreground">{interviewer.persona}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border/70">
                <CardTitle className="text-base">Question plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-5">
                {["Screening", "Technical Deep Dive", "Problem Solving", "Wrap-up"].map(
                  (stage, index) => (
                    <div key={stage} className="flex items-center gap-3 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        0{index + 1}
                      </span>
                      <span>{stage}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {index === 0 ? 2 : index === 3 ? 1 : 3} q
                      </span>
                    </div>
                  )
                )}
              </CardContent>
            </Card>

            <Link
              href="/candidates/cand-01"
              className="flex items-center justify-between rounded-lg border border-blue-400/20 bg-blue-500/[.06] p-4 text-sm hover:border-blue-400/40"
              data-testid="campaign-open-result-link"
            >
              <span>
                <span className="block font-medium">View latest evaluation</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Marcus Chen · 8.7/10
                </span>
              </span>
              <ExternalLink className="size-4 text-blue-300" />
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
