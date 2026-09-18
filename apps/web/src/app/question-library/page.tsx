"use client";

import { useMemo, useState } from "react";
import { Copy, MoreHorizontal, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/PageHeader";
import { AppShell } from "@/components/app/AppShell";
import { questions } from "@/data/mockData";

export default function QuestionLibraryPage() {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);

  const categories = [
    "All",
    "Python",
    "Backend",
    "System Design",
    "SQL",
    "React",
    "Machine Learning",
    "LLMs",
    "RAG",
    "Behavioral",
  ];

  const filtered = useMemo(
    () =>
      questions.filter(
        (item) =>
          (category === "All" || item.category === category) &&
          item.question.toLowerCase().includes(search.toLowerCase())
      ),
    [category, search]
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] p-5 sm:p-8" data-testid="question-library-page">
        <PageHeader
          title="Question library"
          description="A living library of technical prompts and evaluation signals."
          action={
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setGenerateOpen(true)}
                data-testid="generate-questions-button"
              >
                <Sparkles className="size-4 text-blue-300" />
                Generate with AI
              </Button>
              <Button
                onClick={() => toast.success("Question editor opened")}
                data-testid="add-question-button"
              >
                <Plus className="size-4" />
                Add question
              </Button>
            </div>
          }
        />

        <div className="mb-5 flex flex-col gap-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search questions"
              className="pl-9"
              aria-label="Search question library"
              data-testid="question-search-input"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`whitespace-nowrap rounded-md border px-3 py-1.5 text-xs ${
                  category === item
                    ? "border-blue-400/40 bg-blue-400/10 text-blue-200"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`question-category-${item.toLowerCase().replaceAll(" ", "-")}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map((item, index) => (
            <Card key={item.id} className="group" data-testid={`question-card-${item.id}`}>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-6">{item.question}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-blue-400/10 px-2 py-1 text-[10px] text-blue-200">
                      {item.category}
                    </span>
                    <span className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                      {item.difficulty}
                    </span>
                    {item.skills.map((skill) => (
                      <span key={skill} className="text-[11px] text-muted-foreground">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:pl-4">
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.used} uses
                  </span>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => toast.success("Question duplicated")}
                    aria-label="Duplicate question"
                    data-testid={`duplicate-question-${item.id}`}
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-red-300"
                    onClick={() => toast.info("Question moved to archive")}
                    aria-label="Delete question"
                    data-testid={`delete-question-${item.id}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <MoreHorizontal className="size-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
          <DialogContent className="max-w-lg" data-testid="generate-questions-dialog">
            <DialogHeader>
              <DialogTitle>Generate interview questions</DialogTitle>
              <DialogDescription>
                Describe the role and ZARA will suggest questions with rubrics.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                defaultValue="Senior Backend Engineer · Python, FastAPI, distributed systems"
                data-testid="generate-question-context-input"
              />
              <div className="rounded-md border border-blue-400/20 bg-blue-500/[.06] p-4">
                <p className="flex items-center gap-2 text-xs font-medium text-blue-200">
                  <Sparkles className="size-3.5" />
                  Preview suggestions
                </p>
                <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                  <li>
                    01 · How would you make a FastAPI service resilient under burst traffic?
                  </li>
                  <li>
                    02 · What consistency guarantees would you choose for a distributed job
                    queue?
                  </li>
                  <li>03 · How do you evaluate an API’s performance in production?</li>
                </ul>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  setGenerateOpen(false);
                  toast.success("3 questions added to your library");
                }}
                data-testid="confirm-generate-questions-button"
              >
                <Sparkles className="size-4" />
                Add generated questions
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
