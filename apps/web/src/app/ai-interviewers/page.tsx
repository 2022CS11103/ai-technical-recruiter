"use client";

import { useState } from "react";
import {
  Copy,
  Edit3,
  Headphones,
  Play,
  Plus,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/PageHeader";
import { InterviewerAvatar } from "@/components/app/InterviewerAvatar";
import { Waveform } from "@/components/app/Waveform";
import { AppShell } from "@/components/app/AppShell";
import { interviewers } from "@/data/mockData";

export default function AIInterviewersPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const interviewer = interviewers.find((item) => item.id === preview);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] p-5 sm:p-8" data-testid="ai-interviewers-page">
        <PageHeader
          title="AI Interviewers"
          description="Build a panel of consistent, thoughtful interview personalities."
          action={
            <Button
              onClick={() => toast.success("Persona builder opened")}
              data-testid="create-ai-interviewer-button"
            >
              <Plus className="size-4" />
              Create AI interviewer
            </Button>
          }
        />

        <div className="grid gap-4 lg:grid-cols-3">
          {interviewers.map((person) => (
            <Card key={person.id} className="group" data-testid={`ai-interviewer-card-${person.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <InterviewerAvatar interviewer={person} size="md" />
                  <button
                    onClick={() => setPreview(person.id)}
                    className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground hover:border-blue-400/40 hover:text-foreground"
                    aria-label={`Preview ${person.name}`}
                    data-testid={`preview-ai-interviewer-${person.id}`}
                  >
                    <Play className="size-3.5" />
                  </button>
                </div>

                <h2 className="mt-5 text-lg font-medium">{person.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{person.title}</p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{person.persona}</p>

                <div className="mt-5 grid grid-cols-2 gap-3 border-y border-border py-4">
                  <div>
                    <p className="font-mono text-lg">{person.interviewsConducted}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Completed
                    </p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 font-mono text-lg">
                      <Star className="size-3.5 fill-amber-300 text-amber-300" />
                      {person.rating.split(" ")[0]}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Rating
                    </p>
                  </div>
                </div>

                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Headphones className="size-3.5 text-blue-300" />
                  {person.voice}
                </p>

                <div className="mt-5 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => toast.info(`${person.name} settings opened`)}
                    data-testid={`edit-ai-interviewer-${person.id}`}
                  >
                    <Edit3 className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toast.success(`${person.name} duplicated`)}
                    data-testid={`duplicate-ai-interviewer-${person.id}`}
                  >
                    <Copy className="size-3.5" />
                    Duplicate
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-border p-6">
          <div className="flex items-center gap-4">
            <span className="grid size-10 place-items-center rounded-md bg-muted text-muted-foreground">
              <SlidersHorizontal className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">Persona controls are built for your rubric</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tune tone, technical depth, pacing, and default greetings without changing your
                interview logic.
              </p>
            </div>
          </div>
        </div>

        <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="max-w-lg" data-testid="ai-interviewer-preview-dialog">
            <DialogHeader>
              <DialogTitle>{interviewer?.name} voice preview</DialogTitle>
              <DialogDescription>
                Listen to the persona your candidates will meet.
              </DialogDescription>
            </DialogHeader>
            {interviewer && (
              <div className="rounded-lg border border-border bg-[#0b0e14] p-6">
                <div className="flex flex-col items-center text-center">
                  <InterviewerAvatar interviewer={interviewer} size="lg" pulse />
                  <p className="mt-6 font-medium">{interviewer.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{interviewer.voice}</p>
                  <Waveform compact />
                  <p className="mt-2 text-xs text-blue-300">
                    “Tell me about a backend system you’re proud to have built.”
                  </p>
                </div>
                <div className="mt-6 flex justify-center">
                  <Button
                    onClick={() => toast.success("Voice preview playing")}
                    data-testid="play-voice-preview-button"
                  >
                    <Play className="size-4" />
                    Play preview
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
