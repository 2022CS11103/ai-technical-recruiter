"use client";

import { useEffect, useState } from "react";
import { CreditCard, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/PageHeader";
import { AppShell } from "@/components/app/AppShell";
import { api } from "@/lib/api";

type Billing = {
  balance: number;
  interview_cost: number;
  ledger: Array<{ id: string; amount: number; reason: string; created_at: string }>;
};

const packs = [50, 100, 250];

export default function BillingPage() {
  const [data, setData] = useState<Billing | null>(null);
  const [loading, setLoading] = useState<number | null>(null);

  const load = () =>
    api<Billing>("/api/v1/billing/credits")
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load credits"));

  useEffect(() => {
    load();
  }, []);

  async function buy(amount: number) {
    setLoading(amount);
    try {
      await api("/api/v1/billing/credits/topup", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      toast.success(`Added ${amount} interview credits`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Top-up failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1100px] p-5 sm:p-8">
        <PageHeader
          eyebrow="RECRUITER WORKSPACE"
          title="Credit billing"
          description="Each launched interview uses credits. Top up to keep screening."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-blue-400/20 bg-blue-500/[.05]">
            <CardContent className="p-6">
              <p className="text-xs text-blue-200">Available credits</p>
              <p className="mt-2 font-mono text-4xl">{data?.balance ?? "—"}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {data?.interview_cost ?? 10} credits per interview
              </p>
            </CardContent>
          </Card>
          {packs.map((amount) => (
            <Card key={amount}>
              <CardContent className="p-6">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="size-4 text-blue-300" />
                  {amount} credits
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  About {Math.floor(amount / (data?.interview_cost || 10))} interviews
                </p>
                <Button
                  className="mt-4"
                  disabled={loading === amount}
                  onClick={() => buy(amount)}
                >
                  {loading === amount ? "Adding…" : "Add credits"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="mt-6">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-blue-300" />
              Ledger
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/70 p-0">
            {(data?.ledger || []).length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">No credit activity yet.</p>
            )}
            {(data?.ledger || []).map((row) => (
              <div key={row.id} className="flex items-center justify-between p-4 text-sm">
                <span className="text-muted-foreground">{row.reason.replaceAll("_", " ")}</span>
                <span className={row.amount < 0 ? "font-mono text-amber-300" : "font-mono text-emerald-300"}>
                  {row.amount > 0 ? `+${row.amount}` : row.amount}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
