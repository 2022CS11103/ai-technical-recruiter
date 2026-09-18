"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { AppShell } from "@/components/app/AppShell";
import { candidates } from "@/data/mockData";

export default function CandidatesPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const filtered = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          (filter === "All" || candidate.status === filter) &&
          `${candidate.name} ${candidate.role} ${candidate.email}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [search, filter]
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] p-5 sm:p-8" data-testid="candidates-page">
        <PageHeader
          title="Candidates"
          description="Review every interview through one structured evaluation layer."
          action={
            <Button
              variant="outline"
              onClick={() => setFilter("Completed")}
              data-testid="candidates-filter-button"
            >
              <Filter className="size-4" />
              Filter candidates
            </Button>
          }
        />

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, or role"
              className="pl-9"
              aria-label="Search candidates"
              data-testid="candidates-search-input"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto rounded-md bg-muted/40 p-1">
            {["All", "Completed", "In Progress", "Invited"].map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`whitespace-nowrap rounded px-3 py-1.5 text-xs ${
                  filter === item ? "bg-card text-foreground" : "text-muted-foreground"
                }`}
                data-testid={`candidate-filter-${item.toLowerCase().replaceAll(" ", "-")}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead className="border-b border-border/70 text-[10px] uppercase tracking-[.15em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Candidate</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Score</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Recommendation</th>
                  <th className="px-5 py-3">Interview date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((candidate) => (
                  <tr
                    key={candidate.id}
                    className="group hover:bg-muted/20"
                    data-testid={`candidate-row-${candidate.id}`}
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/candidates/${candidate.id}`}
                        className="flex items-center gap-3"
                        data-testid={`candidate-profile-link-${candidate.id}`}
                      >
                        <img
                          src={candidate.avatar}
                          alt={`${candidate.name} avatar`}
                          className="size-9 rounded-full object-cover"
                        />
                        <span>
                          <span className="block text-sm font-medium">{candidate.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {candidate.email}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {candidate.role}
                    </td>
                    <td className="px-5 py-4 font-mono text-sm">
                      {candidate.score ? `${candidate.score}/10` : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={candidate.status} />
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {candidate.score ? candidate.recommendation : "Awaiting interview"}
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {candidate.date}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div
              className="p-12 text-center text-sm text-muted-foreground"
              data-testid="candidates-empty-state"
            >
              No candidates match this view.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
