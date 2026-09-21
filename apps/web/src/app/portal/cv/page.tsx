"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app/PageHeader";
import { CandidateShell } from "@/components/app/CandidateShell";
import { api } from "@/lib/api";

export default function CandidateCvPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/v1/portal/cv", {
        method: "POST",
        body: JSON.stringify({ resume_text: text }),
      });
      toast.success("CV parsed into your candidate profile");
      router.push("/portal");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload CV");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CandidateShell>
      <div className="mx-auto max-w-[720px] p-5 sm:p-8">
        <PageHeader
          eyebrow="CANDIDATE EXPERIENCE"
          title="Upload CV"
          description="Paste your resume. ZARA extracts skills, projects, and claims to probe in the interview."
        />
        <Card>
          <CardContent className="p-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Resume text</Label>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="min-h-64"
                  placeholder="Paste the full resume, including projects and tech stack."
                  required
                />
              </div>
              <Button type="submit" disabled={saving || text.trim().length < 40}>
                {saving ? "Parsing…" : "Save CV"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </CandidateShell>
  );
}
