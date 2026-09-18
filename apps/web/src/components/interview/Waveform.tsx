"use client";

interface WaveformProps {
  active?: boolean;
  thinking?: boolean;
  compact?: boolean;
  /** 0–1 mic level; when listening, bars scale with real audio */
  level?: number;
}

export function Waveform({
  active = true,
  thinking = false,
  compact = false,
  level = 0.35,
}: WaveformProps) {
  const bars = compact ? 18 : 28;
  const amp = active ? Math.max(0.18, Math.min(1, level || 0.35)) : 0.12;

  return (
    <div
      className={`zara-waveform flex items-center justify-center gap-[3px] ${compact ? "h-6" : "h-16"}`}
      aria-label="Audio waveform"
      data-testid="audio-waveform"
    >
      {Array.from({ length: bars }, (_, index) => {
        const base = 6 + (index % 5) * 4;
        const peak = compact ? 14 + (index % 3) * 4 : 28 + (index % 5) * 6;
        const h = active ? base + (peak - base) * amp * (0.55 + 0.45 * Math.abs(Math.sin(index * 0.7))) : 5;
        return (
          <span
            key={index}
            className={`zara-wave-bar w-[3px] rounded-full ${
              thinking ? "bg-violet-300" : active ? "bg-blue-400" : "bg-slate-600"
            } ${active ? "zara-wave-anim" : ""}`}
            style={{
              height: `${h}px`,
              animationDelay: `${index * 0.025}s`,
              animationDuration: thinking ? "1.4s" : `${0.75 + (index % 4) * 0.08}s`,
            }}
          />
        );
      })}
    </div>
  );
}
