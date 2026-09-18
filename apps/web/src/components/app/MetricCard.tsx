import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function MetricCard({
  label,
  value,
  detail,
  trend,
  accent = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  trend: "up" | "down";
  accent?: "blue" | "green" | "violet" | "amber";
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-card p-5"
      data-testid={`metric-card-${label.toLowerCase().replaceAll(" ", "-")}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-px ${
          accent === "green"
            ? "bg-emerald-400"
            : accent === "violet"
              ? "bg-violet-400"
              : accent === "amber"
                ? "bg-amber-400"
                : "bg-blue-400"
        }`}
      />
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-4 flex items-end justify-between gap-2">
        <span className="font-mono text-3xl font-semibold tracking-tight">{value}</span>
        <span
          className={`flex items-center gap-1 text-xs ${
            trend === "up" ? "text-emerald-400" : "text-amber-300"
          }`}
        >
          {trend === "up" ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownRight className="size-3.5" />
          )}
          {detail}
        </span>
      </div>
    </div>
  );
}
