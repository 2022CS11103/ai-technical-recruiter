"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileUp, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app/PageHeader";
import { CandidateShell } from "@/components/app/CandidateShell";
import { api } from "@/lib/api";

type Me = {
  full_name: string;
  email: string;
  has_resume: boolean;
  skills: string[];
};

type HistoryRow = { id: string; role: string; status: string; date: string; has_feedback: boolean };

export default function CandidateDashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    api<Me>("/api/v1/portal/me").then(setMe).catch(() => setMe(null));
    api<HistoryRow[]>("/api/v1/portal/interviews").then(setHistory).catch(() => setHistory([]));
  }, []);

  return (
    <CandidateShell>
      <div className="mx-auto max-w-[1100px] p-5 sm:p-8">
        <PageHeader
          eyebrow="CANDIDATE EXPERIENCE"
          title={`Welcome${me?.full_name ? `, ${me.full_name.split(" ")[0]}` : ""}`}
          description="Upload your CV, take a ZARA voice interview, then review evidence-based feedback."
          action={
            <Link href="/interview/try">
              <Button>
                <Mic className="size-4" />
                Start interview
              </Button>
            </Link>
          }
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">Profile</p>
              <p className="mt-2 text-lg font-medium">{me?.full_name || "Complete your profile"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{me?.email}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">Resume</p>
              <p className="mt-2 text-lg font-medium">{me?.has_resume ? "Uploaded" : "Missing"}</p>
              <Link href="/portal/cv" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300">
                <FileUp className="size-3" />
                Update CV
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">Interviews</p>
              <p className="mt-2 text-lg font-medium">{history.length}</p>
              <Link href="/portal/history" className="mt-2 inline-block text-xs text-blue-300">
                View history
              </Link>
            </CardContent>
          </Card>
        </div>
        <Card className="mt-6">
          <CardContent className="p-6">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-blue-300" />
              Recent interviews
            </p>
            <div className="mt-4 space-y-3">
              {history.slice(0, 5).map((row) => (
                <div key={row.id} className="flex items-center justify-between text-sm">
                  <span>
                    {row.role} · {row.date}
                  </span>
                  {row.has_feedback ? (
                    <Link href={`/portal/feedback/${row.id}`} className="text-blue-300">
                      Feedback
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{row.status}</span>
                  )}
                </div>
              ))}
              {history.length === 0 && (
                <p className="text-sm text-muted-foreground">No interviews yet. Start a voice session when you are ready.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </CandidateShell>
  );
}
