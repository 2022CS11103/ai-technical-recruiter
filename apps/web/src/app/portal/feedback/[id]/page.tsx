"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/PageHeader";
import { CandidateShell } from "@/components/app/CandidateShell";
import { api } from "@/lib/api";

type Feedback = {
  name: string;
  role: string;
  status: string;
  strengths: string[];
  weak_areas: string[];
  technical_gaps: string[];
  suggested_learning_topics: string[];
  improvement_suggestions: string[];
  note: string;
};

export default function CandidateFeedbackPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Feedback | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.id) return;
    api<Feedback>(`/api/v1/portal/interviews/${params.id}/feedback`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Feedback not found"));
  }, [params.id]);

  return (
    <CandidateShell>
      <div className="mx-auto max-w-[900px] p-5 sm:p-8">
        <Link href="/portal/history" className="text-sm text-muted-foreground hover:text-foreground">
          ← Interview history
        </Link>
        <PageHeader
          eyebrow="FEEDBACK GENERATOR"
          title={data?.role || "Interview feedback"}
          description={data?.note || "Practice feedback from the evidence ZARA collected."}
        />
        {error && <p className="text-sm text-muted-foreground">{error}</p>}
        {data && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Strengths</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {(data.strengths || []).map((item) => (
                  <p key={item}>• {item}</p>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Areas to improve</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {(data.weak_areas || []).map((item) => (
                  <p key={item}>• {item}</p>
                ))}
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Suggested learning</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {(data.suggested_learning_topics.length
                  ? data.suggested_learning_topics
                  : data.technical_gaps
                ).map((item) => (
                  <p key={item}>• {item}</p>
                ))}
                {(data.improvement_suggestions || []).map((item) => (
                  <p key={item}>• {item}</p>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </CandidateShell>
  );
}
