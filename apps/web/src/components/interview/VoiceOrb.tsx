"use client";

interface VoiceOrbProps {
  active?: boolean;
  speaking?: boolean;
  thinking?: boolean;
  level?: number;
  mark?: string;
  size?: "md" | "lg";
}

/** micro1-style soft aura + white disc for the AI interviewer. */
export function VoiceOrb({
  active = false,
  speaking = false,
  thinking = false,
  level = 0.3,
  mark = "z.",
  size = "lg",
}: VoiceOrbProps) {
  const amp = Math.max(0.15, Math.min(1, level || 0.3));
  const dim = size === "lg" ? 168 : 96;

  return (
    <div
      className={`zara-aura ${speaking ? "is-speaking" : ""} ${active ? "is-listening" : ""} ${
        thinking ? "is-thinking" : ""
      }`}
      style={{ width: dim, height: dim, ["--aura-amp" as string]: String(0.85 + amp * 0.35) }}
      aria-hidden
    >
      <span className="zara-aura-glow" />
      <span className="zara-aura-glow soft" />
      <div className="zara-aura-disc">
        <span className="zara-aura-mark">{mark}</span>
      </div>
    </div>
  );
}
