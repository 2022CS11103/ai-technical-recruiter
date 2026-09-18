"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Plus, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InterviewerAvatar } from "@/components/app/InterviewerAvatar";
import { AppShell } from "@/components/app/AppShell";
import { interviews, interviewers } from "@/data/mockData";

const tabs = ["All", "Active", "Drafts", "Completed"] as const;

export default function InterviewsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      interviews.filter((item) => {
        const matchesTab =
          tab === "All" ||
          (tab === "Active" &&
            (item.status === "Active" || item.status === "Pending Review")) ||
          (tab === "Drafts" && item.status === "Draft") ||
          (tab === "Completed" && item.status === "Completed");

        return (
          matchesTab &&
          `${item.name} ${item.role}`.toLowerCase().includes(search.toLowerCase())
        );
      }),
    [tab, search]
  );

  const copyLink = async (id: string) => {
    await navigator.clipboard?.writeText(`${window.location.origin}/interview/${id}`);
    toast.success("Interview link copied");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] p-5 sm:p-8" data-testid="interviews-page">
        <PageHeader
          title="Interviews"
          description="Create and manage AI-powered interview campaigns."
          action={
            <Link href="/interviews/new" data-testid="interviews-create-link">
              <Button size="lg">
                <Plus className="size-4" />
                Create Interview
              </Button>
            </Link>
          }
        />

        <div className="mb-6 flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex gap-1 rounded-md bg-muted/50 p-1"
            role="tablist"
            aria-label="Interview status filters"
          >
            {tabs.map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`rounded px-3 py-1.5 text-xs ${
                  tab === item
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                role="tab"
                aria-selected={tab === item}
                data-testid={`interview-tab-${item.toLowerCase()}`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search interviews"
                className="h-9 w-full pl-9 sm:w-56"
                aria-label="Search interviews"
                data-testid="interviews-search-input"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Open interview filters"
              data-testid="interviews-filter-button"
            >
              <SlidersHorizontal />
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const interviewer = interviewers.find(
              (person) => person.id === item.interviewerId
            )!;

            return (
              <article
                key={item.id}
                className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-blue-400/35"
                data-testid={`interview-card-${item.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <StatusBadge status={item.status} />
                  <button
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => copyLink(item.id)}
                    aria-label={`Copy ${item.name} link`}
                    data-testid={`copy-interview-link-${item.id}`}
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>

                <Link
                  href={`/interviews/${item.id}`}
                  className="mt-5 block"
                  data-testid={`interview-detail-link-${item.id}`}
                >
                  <h2 className="text-lg font-medium tracking-tight">{item.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.role} · {item.company}
                  </p>
                  <div className="mt-5 flex items-center gap-3">
                    <InterviewerAvatar interviewer={interviewer} size="sm" />
                    <div>
                      <p className="text-xs text-muted-foreground">AI interviewer</p>
                      <p className="text-sm">
                        {interviewer.name}{" "}
                        <span className="text-muted-foreground">· {item.duration} min</span>
                      </p>
                    </div>
                  </div>
                </Link>

                <div className="mt-5 grid grid-cols-3 border-t border-border pt-4">
                  <div>
                    <p className="font-mono text-lg">{item.candidates}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Candidates
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-lg">{item.completion}%</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Complete
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-lg">{item.score || "—"}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Avg score
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Created {item.created}</span>
                  <Link
                    href="/interview/try"
                    className="flex items-center gap-1 text-blue-400 opacity-0 transition-opacity group-hover:opacity-100"
                    data-testid={`preview-interview-link-${item.id}`}
                  >
                    Preview
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div
            className="rounded-lg border border-dashed border-border p-12 text-center"
            data-testid="interviews-empty-state"
          >
            <p className="font-medium">No interviews found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search or create a new campaign.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
