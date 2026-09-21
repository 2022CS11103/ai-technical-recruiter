"use client";

import { useEffect, useRef } from "react";
import { VoiceOrb } from "@/components/interview/VoiceOrb";

type AgentState = "listening" | "thinking" | "speaking" | "idle";
type VoiceLang = "en-IN" | "hi-IN" | "en-US";

type Props = {
  mode: "briefing" | "live";
  interviewer: string;
  role?: string;
  candidateName?: string;
  timer: string;
  /** Full pinned question — stays until the next AI question. */
  question: string;
  /** Typewriter reveal while AI is speaking (subset of question). */
  spokenDisplay?: string;
  topicLabel?: string | null;
  partialHeard?: string;
  agentState: AgentState;
  micHint?: string;
  micLevel: number;
  micDevices: MediaDeviceInfo[];
  micDeviceId: string;
  voiceLang: VoiceLang;
  stages?: string[];
  stageIndex?: number;
  error?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onMicDevice: (id: string) => void;
  onVoiceLang: (lang: VoiceLang) => void;
  onMicClick: () => void;
  onReplay?: () => void;
};

const DEFAULT_STAGES = ["Introduction", "Resume", "Technical", "Wrap-up"];

export function MicroInterviewRoom({
  mode,
  interviewer,
  role,
  candidateName,
  timer,
  question,
  spokenDisplay,
  topicLabel,
  partialHeard,
  agentState,
  micHint,
  micLevel,
  micDevices,
  micDeviceId,
  voiceLang,
  stages = DEFAULT_STAGES,
  stageIndex = 0,
  error,
  onStart,
  onEnd,
  onMicDevice,
  onVoiceLang,
  onMicClick,
  onReplay,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      } catch {
        /* webcam optional */
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // While speaking: typewriter. Otherwise pin the full question until the next one arrives.
  const captionText =
    mode === "briefing"
      ? `Hi${candidateName ? ` ${candidateName.split(" ")[0]}` : ""}, I'm ${interviewer}. Ready when you are.`
      : agentState === "speaking"
        ? spokenDisplay || ""
        : question || micHint || "…";

  const statusChip =
    agentState === "speaking"
      ? `${interviewer} speaking`
      : agentState === "thinking"
        ? "Thinking…"
        : agentState === "listening"
          ? "Your turn"
          : "Ready";

  const activeStage = Math.min(Math.max(stageIndex, 0), stages.length - 1);

  return (
    <div className="micro-room" data-testid={mode === "briefing" ? "candidate-briefing-room" : "candidate-active-room"}>
      <header className="micro-top">
        <div className="micro-brand">
          <span className="micro-logo">zara.</span>
          {mode === "live" && <span className="micro-live-dot" title="Connected" />}
        </div>

        {mode === "live" && (
          <nav className="micro-stages" aria-label="Interview stages">
            {stages.map((label, i) => (
              <button
                key={label}
                type="button"
                className={`micro-stage ${i === activeStage ? "is-active" : ""} ${i < activeStage ? "is-done" : ""}`}
                tabIndex={-1}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        <div className="micro-timer" aria-label="Time remaining">
          <ClockIcon />
          <span>{timer}</span>
        </div>
      </header>

      <main className={`micro-main ${mode === "briefing" ? "is-briefing" : "is-live"}`}>
        <div className="micro-stage-area">
          <VoiceOrb
            mark="Z"
            size="lg"
            active={agentState === "listening"}
            speaking={agentState === "speaking" || mode === "briefing"}
            thinking={agentState === "thinking"}
            level={
              agentState === "listening"
                ? Math.max(0.25, micLevel)
                : agentState === "speaking"
                  ? 0.7
                  : 0.35
            }
          />
          {mode === "live" && (
            <div className="micro-caption-block">
              {topicLabel && <p className="micro-topic-badge">{topicLabel}</p>}
              <p className="micro-caption" aria-live="polite">
                {captionText}
                {agentState === "speaking" && spokenDisplay && spokenDisplay.length < (question?.length || 0) ? (
                  <span className="micro-caret" />
                ) : null}
              </p>
              {agentState === "listening" && partialHeard ? (
                <p className="micro-you-saying">You’re saying: {partialHeard}</p>
              ) : null}
              {agentState === "thinking" ? (
                <p className="micro-status-line">{interviewer} is thinking…</p>
              ) : null}
            </div>
          )}
        </div>

        {mode === "briefing" && (
          <aside className="micro-brief">
            <h1 className="micro-brief-title">Before starting the interview,</h1>
            <ol className="micro-brief-list">
              <li>
                This session is recorded and shared with recruiters as an evidence-based dossier — not a vibe score.
              </li>
              <li>
                Stay on this tab. Leaving or switching away may be flagged by the proctoring checks.
              </li>
              <li>
                Ask clarifying questions anytime. Prefer not to repeat the question out loud into the mic.
              </li>
              <li>
                Pause ~2 seconds when you finish an answer — {interviewer} will continue to the next question.
              </li>
            </ol>
            {role && <p className="micro-brief-role">Role: {role}</p>}
            {error && <p className="micro-error">{error}</p>}
            <button type="button" className="micro-cta" onClick={onStart} data-testid="start-interview-button">
              Sounds good, start interview
            </button>
          </aside>
        )}
      </main>

      <div className="micro-bottom-left">
        <div className="micro-mic-card">
          <MicGlyph />
          <select
            className="micro-mic-select"
            value={micDeviceId}
            onChange={(e) => onMicDevice(e.target.value)}
            aria-label="Microphone"
          >
            {micDevices.length === 0 ? (
              <option value="">You (Default mic)</option>
            ) : (
              micDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  You ({d.label || d.deviceId.slice(0, 8)})
                </option>
              ))
            )}
          </select>
          <div className="micro-level" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={micLevel > (i + 1) * 0.12 ? "on" : ""} />
            ))}
          </div>
          <select
            className="micro-lang-select"
            value={voiceLang}
            onChange={(e) => onVoiceLang(e.target.value as VoiceLang)}
            aria-label="Language"
          >
            <option value="en-IN">EN-IN</option>
            <option value="en-US">EN-US</option>
            <option value="hi-IN">HI</option>
          </select>
        </div>
        <div className="micro-cam">
          <video ref={videoRef} className="micro-cam-video" playsInline muted autoPlay />
          <span className="micro-cam-fallback">Camera</span>
        </div>
      </div>

      {mode === "live" && (
        <div className="micro-bottom-actions">
          <button
            type="button"
            className={`micro-round ${agentState === "listening" ? "is-hot" : ""}`}
            onClick={onMicClick}
            data-testid="done-speaking-button"
            title={agentState === "listening" ? "I'm done speaking" : "Microphone"}
          >
            <MicGlyph />
          </button>
          <span className="micro-ready-label">{statusChip}</span>
          {onReplay && (
            <button type="button" className="micro-link" onClick={onReplay}>
              Replay
            </button>
          )}
          {onEnd && (
            <button type="button" className="micro-round is-end" onClick={onEnd} title="End interview">
              <EndGlyph />
            </button>
          )}
        </div>
      )}

      <a className="micro-help" href="mailto:support@example.com">
        Having trouble?
      </a>

      {error && mode === "live" && <p className="micro-toast-error">{error}</p>}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v4.5l3 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MicGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function EndGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
