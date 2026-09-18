"use client";

import { Badge } from "@/components/ui/badge";
import type { InterviewStatus, Recommendation, VoiceState } from "@/types/domain";

export function StatusBadge({
  status,
}: {
  status: InterviewStatus | Recommendation | VoiceState | string;
}) {
  const tone =
    status === "Completed" || status === "Strong Hire" || status === "LISTENING"
      ? "success"
      : status === "Active" || status === "In Progress" || status === "SPEAKING"
        ? "info"
        : status === "THINKING"
          ? "violet"
          : status === "No Hire" || status === "ERROR"
            ? "danger"
            : "neutral";

  return (
    <Badge
      data-testid={`status-badge-${status.toLowerCase().replaceAll(" ", "-")}`}
      className={`status-${tone}`}
    >
      {status}
    </Badge>
  );
}
