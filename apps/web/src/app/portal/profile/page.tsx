"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app/PageHeader";
import { CandidateShell } from "@/components/app/CandidateShell";
import { api } from "@/lib/api";

export default function CandidateProfilePage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [summary, setSummary] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    api<{ full_name: string; phone: string; summary: string; email: string }>("/api/v1/portal/me")
      .then((me) => {
        setFullName(me.full_name || "");
        setPhone(me.phone || "");
        setSummary(me.summary || "");
        setEmail(me.email || "");
      })
      .catch(() => null);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/portal/profile", {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName, phone, summary }),
      });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <CandidateShell>
      <div className="mx-auto max-w-[720px] p-5 sm:p-8">
        <PageHeader title="Candidate profile" description="Keep your details current before a ZARA interview." />
        <Card>
          <CardContent className="p-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} disabled />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Summary</Label>
                <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-28" />
              </div>
              <Button type="submit">Save profile</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </CandidateShell>
  );
}
