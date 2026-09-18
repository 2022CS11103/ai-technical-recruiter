import type { VoiceState } from "@/types/domain";

export interface VoiceTurn {
  state: VoiceState;
  label: string;
  transcript: string;
  speaker: "Sarah" | "You";
}

export const voiceScript: VoiceTurn[] = [
  {
    state: "SPEAKING",
    label: "Sarah is speaking",
    speaker: "Sarah",
    transcript:
      "Welcome, Marcus. Let's start with a system you've built that had to handle unpredictable traffic.",
  },
  {
    state: "LISTENING",
    label: "Listening…",
    speaker: "You",
    transcript:
      "I built a FastAPI service with a queue-based write path and cached read models.",
  },
  {
    state: "THINKING",
    label: "Thinking…",
    speaker: "Sarah",
    transcript: "",
  },
  {
    state: "SPEAKING",
    label: "Sarah is speaking",
    speaker: "Sarah",
    transcript:
      "How did you make the write path resilient when a downstream dependency was unavailable?",
  },
];

export function getVoiceTurn(index: number): VoiceTurn {
  return voiceScript[index % voiceScript.length];
}
