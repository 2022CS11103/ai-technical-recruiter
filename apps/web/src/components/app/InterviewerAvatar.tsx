"use client";

import type { AIInterviewer } from "@/types/domain";

type Props = {
  interviewer?: AIInterviewer;
  name?: string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
};

export function InterviewerAvatar({
  interviewer,
  name,
  size = "md",
  pulse = false,
}: Props) {
  const label = interviewer?.name || name || "S";
  const sizeClass =
    size === "lg"
      ? "size-28 sm:size-36 text-4xl sm:text-5xl"
      : size === "sm"
        ? "size-9 text-sm"
        : "size-12 text-lg";

  return (
    <div
      className={`relative shrink-0 ${pulse ? "avatar-pulse" : ""}`}
      data-testid="interviewer-avatar"
    >
      {pulse && (
        <span className="absolute -inset-4 rounded-full border border-blue-400/25" />
      )}
      <div
        className={`${sizeClass} grid place-items-center rounded-full bg-gradient-to-br from-blue-500/40 to-violet-500/30 font-semibold text-white ring-2 ring-white/10`}
      >
        {label.charAt(0).toUpperCase()}
      </div>
      <span
        className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[#10131b] bg-emerald-400"
        aria-label="Available"
      />
    </div>
  );
}
