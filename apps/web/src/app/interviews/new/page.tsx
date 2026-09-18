"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Play,
  Plus,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app/PageHeader";
import { InterviewerAvatar } from "@/components/app/InterviewerAvatar";
import { AppShell } from "@/components/app/AppShell";
import { interviewers } from "@/data/mockData";

const steps = ["Job", "Interview", "AI Interviewer", "Review", "Launch"];

const defaultSkills = [
  "Python",
  "FastAPI",
  "React",
  "SQL",
  "LLMs",
  "RAG",
  "System Design",
];

const stages = ["Screening", "Technical Deep Dive", "Problem Solving", "Wrap-up"];

export default function NewInterviewPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [analyzed, setAnalyzed] = useState(false);
  const [selected, setSelected] = useState("sarah");
  const [title, setTitle] = useState("Senior Backend Engineer");
  const [company, setCompany] = useState("Zara Labs");
  const [description, setDescription] = useState(
    "Design and build reliable backend systems that power the next generation of collaborative tools. You will work across APIs, data, distributed systems, and applied AI."
  );
  const [duration, setDuration] = useState("30");
  const [questions, setQuestions] = useState("10");

  const interviewer = interviewers.find((item) => item.id === selected)!;
  const next = () => setStep((current) => Math.min(4, current + 1));
  const back = () => setStep((current) => Math.max(0, current - 1));

  const copy = async () => {
    await navigator.clipboard?.writeText(
      `${window.location.origin}/interview/try`
    );
    toast.success("Interview link copied");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-[1100px] p-5 sm:p-8" data-testid="new-interview-page">
        <PageHeader
          eyebrow="INTERVIEWS / NEW CAMPAIGN"
          title="Create an interview"
          description="Configure a structured voice screen that feels natural to every candidate."
          action={
            <Link
              href="/interviews"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              data-testid="new-interview-back-link"
            >
              <ArrowLeft className="size-4" />
              Back to interviews
            </Link>
          }
        />

        <div className="mb-8 grid grid-cols-5 gap-2" data-testid="wizard-progress">
          {steps.map((name, index) => (
            <button
              key={name}
              onClick={() => index <= step && setStep(index)}
              className="group text-left"
              disabled={index > step}
              data-testid={`wizard-step-${name.toLowerCase().replaceAll(" ", "-")}`}
            >
              <div
                className={`mb-3 h-1 rounded-full ${
                  index <= step ? "bg-blue-500" : "bg-muted"
                }`}
              />
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`grid size-5 place-items-center rounded-full border font-mono text-[10px] ${
                    index < step
                      ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                      : index === step
                        ? "border-blue-400 bg-blue-400/10 text-blue-300"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {index < step ? <Check className="size-3" /> : index + 1}
                </span>
                <span className={index === step ? "text-foreground" : "text-muted-foreground"}>
                  {name}
                </span>
              </div>
            </button>
          ))}
        </div>

        {step === 0 && (
          <Card data-testid="wizard-job-step">
            <CardHeader>
              <CardTitle>Define the role</CardTitle>
              <p className="text-sm text-muted-foreground">
                ZARA uses this context to adapt questions and follow-ups.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="job-title">Job title</Label>
                  <Input
                    id="job-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    data-testid="job-title-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    data-testid="company-input"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="experience">Experience level</Label>
                  <select
                    id="experience"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue="Senior"
                    data-testid="experience-level-select"
                  >
                    <option>Mid-level</option>
                    <option>Senior</option>
                    <option>Staff</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    defaultValue="Remote · North America / Europe"
                    data-testid="location-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Job description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-36 resize-y leading-6"
                  data-testid="job-description-input"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <div>
                  <p className="text-sm font-medium">Skills and focus areas</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These become the interview&apos;s competency map.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setAnalyzed(true)}
                  data-testid="analyze-job-button"
                >
                  <WandSparkles className="size-4 text-blue-300" />
                  Analyze with AI
                </Button>
              </div>

              <div className="flex flex-wrap gap-2" data-testid="skills-list">
                {defaultSkills.map((skill) => (
                  <span
                    key={skill}
                    className={`rounded-md border px-2.5 py-1.5 text-xs ${
                      analyzed &&
                      ["Python", "FastAPI", "LLMs", "RAG"].includes(skill)
                        ? "border-blue-400/40 bg-blue-400/10 text-blue-200"
                        : "border-border bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {skill}
                  </span>
                ))}
                <button
                  className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-blue-400/40 hover:text-foreground"
                  data-testid="add-skill-button"
                >
                  <Plus className="mr-1 inline size-3" />
                  Add skill
                </button>
              </div>

              {analyzed && (
                <div
                  className="grid gap-3 rounded-md border border-blue-400/20 bg-blue-500/[.06] p-4 sm:grid-cols-3"
                  data-testid="job-analysis-result"
                >
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-medium text-blue-200">
                      <Sparkles className="size-3.5" />
                      Detected skills
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Python · FastAPI · LLMs · RAG
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-blue-200">
                      Recommended areas
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Coding fundamentals · Architecture · Problem solving
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-blue-200">
                      Suggested setup
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Adaptive difficulty · 30 minutes · 10 questions
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card data-testid="wizard-interview-step">
            <CardHeader>
              <CardTitle>Shape the interview</CardTitle>
              <p className="text-sm text-muted-foreground">
                Tune the pace and behavior of the conversation.
              </p>
            </CardHeader>
            <CardContent className="space-y-7">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <Label>Interview duration</Label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["15", "30", "45", "60"].map((value) => (
                      <button
                        key={value}
                        onClick={() => setDuration(value)}
                        className={`rounded-md border px-4 py-2 text-sm ${
                          duration === value
                            ? "border-blue-400 bg-blue-400/10 text-blue-200"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                        data-testid={`duration-${value}-button`}
                      >
                        {value} min
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Question count</Label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["5", "8", "10", "15"].map((value) => (
                      <button
                        key={value}
                        onClick={() => setQuestions(value)}
                        className={`rounded-md border px-4 py-2 text-sm ${
                          questions === value
                            ? "border-blue-400 bg-blue-400/10 text-blue-200"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                        data-testid={`questions-${value}-button`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <Label>Difficulty</Label>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {["Easy", "Medium", "Hard", "Adaptive"].map((value) => (
                    <button
                      key={value}
                      className={`rounded-md border p-3 text-left ${
                        value === "Adaptive"
                          ? "border-blue-400/35 bg-blue-400/[.08]"
                          : "border-border"
                      }`}
                      data-testid={`difficulty-${value.toLowerCase()}-button`}
                    >
                      <span className="block text-sm font-medium">{value}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {value === "Adaptive" ? "Recommended" : "Fixed level"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Interview stages</Label>
                <div className="mt-3 space-y-2">
                  {stages.map((stage, index) => (
                    <div
                      key={stage}
                      className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-3"
                      data-testid={`stage-${stage.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        0{index + 1}
                      </span>
                      <span className="flex-1 text-sm">{stage}</span>
                      <ChevronDown className="size-4 rotate-[-90deg] text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  "Adaptive follow-ups",
                  "Candidate questions",
                  "Allow interruptions",
                  "Human handoff",
                ].map((label, index) => (
                  <label
                    key={label}
                    className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      defaultChecked={index < 2}
                      className="accent-blue-500"
                      data-testid={`toggle-${label.toLowerCase().replaceAll(" ", "-")}`}
                    />
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card data-testid="wizard-interviewer-step">
            <CardHeader>
              <CardTitle>Select an AI interviewer</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose the presence that best fits this candidate experience.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {interviewers.map((person) => (
                  <button
                    key={person.id}
                    onClick={() => setSelected(person.id)}
                    className={`relative rounded-lg border p-4 text-left ${
                      selected === person.id
                        ? "border-blue-400 bg-blue-400/[.08]"
                        : "border-border hover:border-border/80"
                    }`}
                    data-testid={`select-interviewer-${person.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <InterviewerAvatar interviewer={person} />
                      <span className="grid size-5 place-items-center rounded-full border border-border">
                        {selected === person.id && (
                          <span className="size-2.5 rounded-full bg-blue-400" />
                        )}
                      </span>
                    </div>
                    <p className="mt-4 font-medium">{person.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{person.title}</p>
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">
                      {person.persona}
                    </p>
                    <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-blue-300">
                      <Play className="size-3" />
                      Preview voice
                      <span className="ml-auto font-mono text-muted-foreground">0:12</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-4 rounded-md border border-border bg-muted/20 p-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="interviewer-name">Interviewer name</Label>
                  <Input
                    id="interviewer-name"
                    defaultValue={interviewer.name}
                    className="mt-2"
                    data-testid="interviewer-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="tone">Tone</Label>
                  <Input
                    id="tone"
                    defaultValue="Professional · warm · structured"
                    className="mt-2"
                    data-testid="interviewer-tone-input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="greeting">Opening greeting</Label>
                  <Textarea
                    id="greeting"
                    defaultValue={`Hi, I'm ${interviewer.name}, your AI interviewer. I'll guide you through a short technical interview today.`}
                    className="mt-2 min-h-20"
                    data-testid="interviewer-greeting-input"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <div className="space-y-4" data-testid="wizard-review-step">
            <Card>
              <CardHeader>
                <CardTitle>Review your interview</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Everything looks ready for a realistic, structured screen.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Role", title],
                    ["Company", company],
                    ["Duration", `${duration} minutes`],
                    ["Questions", `${questions} questions`],
                    ["Difficulty", "Adaptive"],
                    ["Interviewer", interviewer.name],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-md border border-border bg-muted/20 p-4"
                    >
                      <p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                        {label}
                      </p>
                      <p className="mt-2 text-sm font-medium">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-md border border-border bg-[#0b0e14] p-5 font-mono text-xs leading-6 text-slate-400">
                  <p className="text-blue-300">ROLE</p>
                  <p>You are a technical interviewer assessing a {title.toLowerCase()}.</p>
                  <p className="mt-3 text-blue-300">GOAL</p>
                  <p>
                    Assess technical depth, problem solving, and communication through adaptive
                    follow-ups.
                  </p>
                  <p className="mt-3 text-blue-300">BEHAVIOR</p>
                  <p>
                    Ask one question at a time. Listen carefully. Ask follow-ups when needed. Do
                    not reveal evaluation criteria.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Button
              variant="outline"
              onClick={() =>
                toast.info("Instructions regenerated from your role context")
              }
              data-testid="regenerate-instructions-button"
            >
              <Sparkles className="size-4" />
              Regenerate instructions
            </Button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5" data-testid="wizard-launch-step">
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[.06] p-6">
              <div className="flex items-start gap-4">
                <span className="grid size-10 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <CheckCircle2 className="size-5" />
                </span>
                <div>
                  <p className="font-medium">Your interview is ready</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Share the link with candidates when you&apos;re ready to start screening.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3 sm:flex-row sm:items-center">
                <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-blue-200">
                  /interview/try
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copy}
                  data-testid="copy-interview-link-button"
                >
                  <Copy className="size-3.5" />
                  Copy link
                </Button>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  onClick={() => toast.success("Invitation queued for Marcus Chen")}
                  data-testid="send-invitation-button"
                >
                  Send invitation
                </Button>
                <Link href="/interview/try" data-testid="preview-candidate-room-link">
                  <Button variant="outline">
                    <Play className="size-4" />
                    Preview interview
                  </Button>
                </Link>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Launch details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-4">
                {[
                  ["Duration", `${duration} min`],
                  ["Questions", questions],
                  ["Interviewer", interviewer.name],
                  ["Evaluation", "4 competencies"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-sm font-medium">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Button
              variant="ghost"
              onClick={() => router.push("/interviews")}
              data-testid="view-created-interview-button"
            >
              <ClipboardCheck className="size-4" />
              Open campaign details
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 0}
            data-testid="wizard-back-button"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          {step < 4 && (
            <Button onClick={next} data-testid="wizard-next-button">
              {step === 3 ? "Generate Interview" : "Continue"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
