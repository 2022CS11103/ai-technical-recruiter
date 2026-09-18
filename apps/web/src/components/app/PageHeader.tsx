import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div
          className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-blue-400"
          data-testid="page-eyebrow"
        >
          {eyebrow ?? "ZARA / WORKSPACE"}
        </div>
        <h1
          className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
          data-testid="page-title"
        >
          {title}
        </h1>
        {description && (
          <p
            className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground"
            data-testid="page-description"
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
