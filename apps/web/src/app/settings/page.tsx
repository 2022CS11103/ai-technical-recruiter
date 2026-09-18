"use client";

import { useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  Globe2,
  KeyRound,
  Link2,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/PageHeader";
import { AppShell } from "@/components/app/AppShell";

const sections = [
  { label: "Workspace", icon: Globe2 },
  { label: "Profile", icon: UserRound },
  { label: "Interview Defaults", icon: SlidersHorizontal },
  { label: "AI Settings", icon: KeyRound },
  { label: "Notifications", icon: Bell },
  { label: "Integrations", icon: Link2 },
];

export default function SettingsPage() {
  const [active, setActive] = useState("Workspace");

  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] p-5 sm:p-8" data-testid="settings-page">
        <PageHeader
          title="Settings"
          description="Shape how ZARA fits into your team’s hiring workflow."
        />

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav className="space-y-1" aria-label="Settings sections">
            {sections.map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => setActive(label)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm ${
                  active === label
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`settings-section-${label.toLowerCase().replaceAll(" ", "-")}`}
              >
                <Icon className="size-4" />
                {label}
                <ChevronRight className="ml-auto size-3.5" />
              </button>
            ))}
          </nav>

          <Card data-testid="settings-content-card">
            <CardHeader className="border-b border-border/70">
              <CardTitle className="text-base">{active}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {active === "Integrations"
                  ? "Connect the tools your team already uses. These are preview controls for the MVP."
                  : "These settings apply to your Zara Labs workspace."}
              </p>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {active === "Integrations" ? (
                <div className="space-y-3">
                  {[
                    "Google Calendar",
                    "Slack",
                    "Greenhouse / Lever ATS",
                    "Email notifications",
                    "Webhooks",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-4 rounded-md border border-border p-4"
                    >
                      <span className="grid size-8 place-items-center rounded bg-muted">
                        <Link2 className="size-4 text-muted-foreground" />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{item}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Not connected · available in the full product
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toast.info(`${item} integration is coming soon`)}
                        data-testid={`connect-${item
                          .toLowerCase()
                          .replaceAll(" ", "-")
                          .replaceAll("/", "")}-button`}
                      >
                        Connect
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="workspace-name">Workspace name</Label>
                      <Input
                        id="workspace-name"
                        defaultValue="Zara Labs"
                        data-testid="workspace-name-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workspace-region">Region</Label>
                      <Input
                        id="workspace-region"
                        defaultValue="North America"
                        data-testid="workspace-region-input"
                      />
                    </div>
                  </div>

                  <div className="border-t border-border pt-6">
                    <p className="text-sm font-medium">Interview defaults</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      New campaigns inherit these defaults.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[
                        "Adaptive follow-ups",
                        "Candidate questions",
                        "Human handoff",
                        "Evaluation summary",
                      ].map((item, index) => (
                        <label
                          key={item}
                          className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
                        >
                          <span>{item}</span>
                          <input
                            type="checkbox"
                            defaultChecked={index !== 2}
                            className="accent-blue-500"
                            data-testid={`settings-toggle-${item
                              .toLowerCase()
                              .replaceAll(" ", "-")}`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={() => toast.success("Settings saved")}
                    data-testid="save-settings-button"
                  >
                    <Check className="size-4" />
                    Save changes
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
