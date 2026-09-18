"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_URL, api } from "@/lib/api";
import { InterviewerAvatar } from "@/components/interview/InterviewerAvatar";
import { Waveform } from "@/components/interview/Waveform";

type Phase = "setup" | "preparing" | "live" | "done" | "error";
type VoiceLang = "en-IN" | "hi-IN" | "en-US";

type InterviewInfo = {
  role?: string;
  candidate_name?: string;
  interviewer_name?: string;
  duration_minutes?: number;
  token?: string;
};

type InterviewSnap = {
  reply?: string;
  interviewer_name?: string;
  candidate_name?: string;
  role?: string;
  duration_minutes?: number;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

type AnswerApiResponse = {
  status?: string;
  reply?: string;
  audio_base64?: string | null;
  interviewer_name?: string;
  candidate_name?: string;
};

const SAMPLE_JD = "";
const SAMPLE_RESUME = "";

const SILENCE_MS = 2500;
/** Survives React Strict Mode remounts so greeting TTS only plays once per token. */
const liveStartedTokens = new Set<string>();
/** Tokens where mic was already opened after greeting (avoid double open on remount). */
const micOpenedTokens = new Set<string>();

function snapKey(token: string) {
  return `atr-interview-snap:${token}`;
}

function saveInterviewSnap(token: string, data: InterviewSnap & Record<string, unknown>) {
  try {
    sessionStorage.setItem(snapKey(token), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function loadInterviewSnap(token: string): InterviewSnap | null {
  try {
    const raw = sessionStorage.getItem(snapKey(token));
    return raw ? (JSON.parse(raw) as InterviewSnap) : null;
  } catch {
    return null;
  }
}

export default function CandidateInterviewPage() {
  const params = useParams<{ token: string }>();
  const initialToken = params.token === "demo" || params.token === "try" ? "" : params.token;

  const [token, setToken] = useState(initialToken);
  const [phase, setPhase] = useState<Phase>(initialToken ? "live" : "setup");
  const [jd, setJd] = useState(SAMPLE_JD);
  const [resume, setResume] = useState(SAMPLE_RESUME);
  const [jdFileName, setJdFileName] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [interviewer, setInterviewer] = useState<"Sarah" | "Rahul">("Sarah");
  const [info, setInfo] = useState<InterviewInfo | null>(null);
  const [connection, setConnection] = useState<"offline" | "connecting" | "live">(
    initialToken ? "connecting" : "offline"
  );
  const [agentState, setAgentState] = useState<"listening" | "thinking" | "speaking" | "idle">(
    initialToken ? "thinking" : "idle"
  );
  const [question, setQuestion] = useState(
    initialToken ? "Connecting… your question will appear here." : ""
  );
  const [partialHeard, setPartialHeard] = useState("");
  const [lastAnswer, setLastAnswer] = useState("");
  const [micHint, setMicHint] = useState("Mic idle");
  const [micLevel, setMicLevel] = useState(0);
  const [micReady, setMicReady] = useState(false);
  const [answer, setAnswer] = useState("");
  const [transcript, setTranscript] = useState<Array<{ role: string; content: string }>>([]);
  const [secondsLeft, setSecondsLeft] = useState(30 * 60);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState<"jd" | "resume" | null>(null);
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("en-IN");
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string>("");
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [aiStatus, setAiStatus] = useState<{
    llm: boolean;
    stt: boolean;
    tts: boolean;
    provider: string;
    model: string;
    ready: boolean;
    hint?: string | null;
  } | null>(null);
  const answerBoxRef = useRef<HTMLTextAreaElement | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const processingRef = useRef(false);
  const answerBufferRef = useRef("");
  const lastHeardRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startListeningRef = useRef<() => void>(() => {});
  const startedForTokenRef = useRef<string | null>(null);
  const playIdRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micRafRef = useRef<number | null>(null);
  const micLevelRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const speechStartedRef = useRef(false);
  const vadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const voiceLangRef = useRef(voiceLang);
  voiceLangRef.current = voiceLang;
  const micDeviceIdRef = useRef(micDeviceId);
  micDeviceIdRef.current = micDeviceId;

  const timer = useMemo(() => {
    const m = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
    const s = (secondsLeft % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [secondsLeft]);

  // Timer only after Sarah actually starts (not while stuck on Connecting)
  useEffect(() => {
    if (phase !== "live" || connection !== "live") return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase, connection]);

  useEffect(() => {
    api<{
      llm: boolean;
      stt: boolean;
      tts: boolean;
      provider: string;
      model: string;
      ready: boolean;
      hint?: string | null;
    }>("/api/v1/ai/status", { auth: false })
      .then(setAiStatus)
      .catch(() =>
        setAiStatus({
          llm: false,
          stt: false,
          tts: false,
          provider: "unknown",
          model: "unknown",
          ready: false,
          hint: "API offline — start uvicorn on :8001",
        })
      );
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopMicMeter = useCallback(() => {
    if (micRafRef.current != null) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    setMicLevel(0);
  }, []);

  /** Fully release mic hardware so SpeechRecognition can own the device (Windows conflict). */
  const releaseMicHardware = useCallback(async () => {
    stopMicMeter();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    if (micAudioCtxRef.current) {
      await micAudioCtxRef.current.close().catch(() => null);
      micAudioCtxRef.current = null;
    }
  }, [stopMicMeter]);

  /** Live RMS meter — reuses an open stream so turns stay seamless. */
  const startLevelMeter = useCallback(
    async (deviceId?: string) => {
      stopMicMeter();
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setMicReady(false);
          setMicHint("No mic API — use Chrome for voice");
          return null;
        }

        const liveTracks = micStreamRef.current?.getAudioTracks().filter((t) => t.readyState === "live") ?? [];
        const wantSwitch =
          Boolean(deviceId) &&
          liveTracks[0] &&
          liveTracks[0].getSettings?.().deviceId &&
          liveTracks[0].getSettings().deviceId !== deviceId;

        if (!liveTracks.length || wantSwitch) {
          micStreamRef.current?.getTracks().forEach((t) => t.stop());
          if (micAudioCtxRef.current) {
            await micAudioCtxRef.current.close().catch(() => null);
            micAudioCtxRef.current = null;
          }
          micAnalyserRef.current = null;

          const constraints: MediaStreamConstraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true,
            video: false,
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          micStreamRef.current = stream;
          stream.getAudioTracks().forEach((t) => {
            t.enabled = true;
          });
        }

        const stream = micStreamRef.current!;
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMicDevices(devices.filter((d) => d.kind === "audioinput"));
        const track = stream.getAudioTracks()[0];
        const settingsId = track?.getSettings?.().deviceId;
        if (settingsId) setMicDeviceId(settingsId);

        if (!micAudioCtxRef.current || micAudioCtxRef.current.state === "closed") {
          const AC = window.AudioContext || (window as SpeechWindow).webkitAudioContext;
          if (!AC) {
            setMicHint("AudioContext unavailable in this browser");
            return null;
          }
          micAudioCtxRef.current = new AC();
        }
        const ctx = micAudioCtxRef.current;
        if (ctx.state === "suspended") await ctx.resume();

        if (!micAnalyserRef.current) {
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.2;
          const gain = ctx.createGain();
          gain.gain.value = 8;
          source.connect(gain);
          gain.connect(analyser);
          micAnalyserRef.current = analyser;
        }

        const analyser = micAnalyserRef.current;
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          if (!micAnalyserRef.current) return;
          analyser.getByteTimeDomainData(data);
          let sumSq = 0;
          let peak = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sumSq += v * v;
            peak = Math.max(peak, Math.abs(v));
          }
          const rms = Math.sqrt(sumSq / data.length);
          const level = Math.min(1, Math.max(rms * 12, peak * 2.2));
          micLevelRef.current = level;
          setMicLevel(level);
          micRafRef.current = requestAnimationFrame(tick);
        };
        tick();
        setMicReady(true);
        return stream;
      } catch (e) {
        setMicReady(false);
        const msg = e instanceof Error ? e.message : "mic error";
        setMicHint(`Mic blocked (${msg}) — allow microphone in the address bar`);
        setError("Allow microphone for this site, then refresh and start again.");
        console.error("[mic] getUserMedia failed", e);
        return null;
      }
    },
    [stopMicMeter]
  );

  useEffect(() => {
    return () => {
      void releaseMicHardware();
    };
  }, [releaseMicHardware]);

  const speakBrowser = useCallback((text: string, voiceHint: string, playId: number) => {
    return new Promise<void>(async (resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve();
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel();

      // Wait briefly for voices (Chrome loads them async)
      let voices = synth.getVoices();
      if (!voices.length) {
        await new Promise<void>((r) => {
          const done = () => r();
          synth.addEventListener("voiceschanged", done, { once: true });
          setTimeout(done, 600);
        });
        voices = synth.getVoices();
      }

      const utter = new SpeechSynthesisUtterance(text);
      const preferFemale = voiceHint.toLowerCase() === "sarah";
      const picked =
        voices.find((v) =>
          preferFemale
            ? /jenny|zira|samantha|neerja|female|google uk english female/i.test(v.name)
            : /guy|david|mark|prabhat|ryan|male|google uk english male/i.test(v.name)
        ) ||
        voices.find((v) => /en-IN|en-GB|en-US/i.test(v.lang)) ||
        voices[0];
      if (picked) utter.voice = picked;
      utter.rate = 1.02;
      utter.pitch = preferFemale ? 1.05 : 1.0;

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      utter.onend = finish;
      utter.onerror = finish;
      // Safety: never hang forever if browser drops onend
      const safety = window.setTimeout(finish, Math.min(60000, 2500 + text.length * 80));

      if (playId !== playIdRef.current) {
        window.clearTimeout(safety);
        finish();
        return;
      }
      setAgentState("speaking");
      // Chrome sometimes needs resume() after cancel
      try {
        synth.resume();
      } catch {
        /* ignore */
      }
      synth.speak(utter);
      utter.addEventListener("end", () => window.clearTimeout(safety));
      utter.addEventListener("error", () => window.clearTimeout(safety));
    });
  }, []);

  const playAgentSpeech = useCallback(
    async (text: string, audioB64?: string | null, name?: string) => {
      const playId = ++playIdRef.current;
      // Stop any previous overlapping speech immediately
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch {
          /* ignore */
        }
      }

      setQuestion(text);
      setAgentState("speaking");
      setMicHint(`${name || interviewer} is speaking…`);

      if (audioB64) {
        try {
          if (!audioRef.current) audioRef.current = new Audio();
          const audio = audioRef.current;
          audio.src = `data:audio/mpeg;base64,${audioB64}`;
          await new Promise<void>((resolve, reject) => {
            audio.onended = () => resolve();
            audio.onerror = () => reject(new Error("audio error"));
            audio.play().catch(reject);
          });
          return;
        } catch {
          if (playId !== playIdRef.current) return;
          // only browser fallback if server audio failed
        }
      }
      if (playId === playIdRef.current) {
        await speakBrowser(text, name || interviewer, playId);
      }
    },
    [interviewer, speakBrowser]
  );

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    clearSilenceTimer();
    if (vadTimerRef.current) {
      clearTimeout(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    speechStartedRef.current = false;
    // Keep level meter running so bars stay live; only stop recognition/recorder
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    try {
      recognitionRef.current?.abort?.();
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  }, [clearSilenceTimer]);

  const openMicAfterAgent = useCallback(() => {
    setAgentState("listening");
    setMicHint("Your turn — mic is open, speak now");
    // Slight delay so Sarah's last audio fully stops before we capture
    window.setTimeout(() => {
      if (!processingRef.current) startListeningRef.current();
    }, 400);
  }, []);

  /** After Next.js remounts on URL change, restore question + reopen mic. */
  const resumeAfterRemount = useCallback(
    async (activeToken: string) => {
      setPhase("live");
      setConnection("live");
      setToken(activeToken);

      const snap = loadInterviewSnap(activeToken);
      if (snap?.reply) {
        setInterviewer((snap.interviewer_name || "Sarah") as "Sarah" | "Rahul");
        setInfo((prev) => ({
          ...prev,
          role: snap.role || prev?.role,
          candidate_name: snap.candidate_name || prev?.candidate_name,
          interviewer_name: snap.interviewer_name,
        }));
        setQuestion(snap.reply);
        setTranscript([{ role: "interviewer", content: snap.reply }]);
        if (snap.duration_minutes) setSecondsLeft(snap.duration_minutes * 60);
      } else {
        try {
          const info = await api<InterviewInfo>(`/api/v1/interview-links/${activeToken}`, { auth: false });
          setInfo(info);
          setInterviewer((info.interviewer_name || "Sarah") as "Sarah" | "Rahul");
          setSecondsLeft((info.duration_minutes || 30) * 60);
          const res = await api<AnswerApiResponse>(`/api/v1/interview-links/${activeToken}/start`, {
            method: "POST",
            auth: false,
          });
          if (res.reply) {
            setQuestion(res.reply);
            setTranscript([{ role: "interviewer", content: res.reply }]);
            saveInterviewSnap(activeToken, {
              reply: res.reply,
              interviewer_name: res.interviewer_name || info.interviewer_name,
              candidate_name: res.candidate_name || info.candidate_name,
              role: info.role,
              duration_minutes: info.duration_minutes,
            });
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not resume interview");
          setPhase("error");
          return;
        }
      }

      // Always reopen mic after remount — this was the stuck "Mic idle" bug
      micOpenedTokens.add(activeToken);
      openMicAfterAgent();
    },
    [openMicAfterAgent]
  );

  const submitAnswer = useCallback(
    async (text: string) => {
      if (!text.trim() || processingRef.current || !token) return;
      processingRef.current = true;
      stopListening();
      answerBufferRef.current = "";
      lastHeardRef.current = "";
      setPartialHeard("");
      setLastAnswer(text.trim());
      setMicHint("Answer sent — waiting for reply");
      setTranscript((t) => [...t, { role: "candidate", content: text }]);
      setAgentState("thinking");
      console.log("%cYOU:", "color:#2a9d8f;font-weight:bold", text.trim());
      try {
        const res = await api<AnswerApiResponse>(`/api/v1/interview-links/${token}/answer`, {
          method: "POST",
          body: JSON.stringify({ answer_text: text }),
          auth: false,
        });
        if (res.status === "completed") {
          setPhase("done");
          setAgentState("idle");
          const bye = "Thanks for your time today. That wraps up the interview.";
          setQuestion(bye);
          setMicHint("Interview finished");
          console.log("%cAI:", "color:#2ec4b6;font-weight:bold", bye);
          await playAgentSpeech(bye, res.audio_base64, interviewer);
          return;
        }
        const reply = res.reply || "Thanks — let's continue.";
        console.log("%cAI:", "color:#2ec4b6;font-weight:bold", reply);
        setTranscript((t) => [...t, { role: "interviewer", content: reply }]);
        setMicHint(`${interviewer} is speaking…`);
        await playAgentSpeech(reply, res.audio_base64, interviewer);
        openMicAfterAgent();
      } catch (e) {
        console.error("answer failed", e);
        setError(e instanceof Error ? e.message : "Failed to process answer");
        setAgentState("idle");
        setMicHint("Something went wrong — mic will reopen");
        setTimeout(() => openMicAfterAgent(), 800);
      } finally {
        processingRef.current = false;
      }
    },
    [token, interviewer, playAgentSpeech, stopListening, openMicAfterAgent]
  );

  const armSilenceCommit = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      // Final chunks OR last interim (Chrome often never marks results final)
      const finalText = (answerBufferRef.current || lastHeardRef.current).trim();
      console.log("[mic] silence commit:", finalText || "(empty — no follow-up)");
      if (finalText && listeningRef.current && !processingRef.current) {
        submitAnswer(finalText);
      } else if (!finalText) {
        setMicHint("Didn’t catch words — speak again, then pause ~2s");
      }
    }, SILENCE_MS);
  }, [clearSilenceTimer, submitAnswer]);

  const submitAnswerRef = useRef(submitAnswer);
  submitAnswerRef.current = submitAnswer;

  const flushVoiceRecording = useCallback(async () => {
    const activeToken = tokenRef.current;
    if (!activeToken || processingRef.current) return;
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      // Recorder not ready — reopen automatically
      window.setTimeout(() => startListeningRef.current(), 300);
      return;
    }
    if (vadTimerRef.current) {
      clearTimeout(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    setMicHint("Got it — transcribing…");
    listeningRef.current = false;
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });
    mediaRecorderRef.current = null;
    const blob = new Blob(recordedChunksRef.current, { type: rec.mimeType || "audio/webm" });
    recordedChunksRef.current = [];
    speechStartedRef.current = false;
    if (blob.size < 800) {
      setMicHint("Didn’t catch that — speak again");
      window.setTimeout(() => startListeningRef.current(), 400);
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", blob, "answer.webm");
      const res = await fetch(`${API_URL}/api/v1/interview-links/${activeToken}/stt`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      const text = String(data.text || "").trim();
      if (!text) {
        if (data.error === "stt_not_configured") {
          setMicHint("Speak again — or type below (add Groq key for Whisper STT)");
          setError("Add LLM_API_KEY in apps/api/.env for voice→text, then restart API.");
        } else {
          setMicHint("Couldn’t hear clearly — speak again");
        }
        window.setTimeout(() => startListeningRef.current(), 500);
        return;
      }
      setPartialHeard(text);
      setMicHint(`You said: “${text}”`);
      console.log("%cYOU (stt):", "color:#2a9d8f;font-weight:bold", text);
      await submitAnswerRef.current(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "STT failed");
      setMicHint("Transcription failed — speak again or type below");
      window.setTimeout(() => startListeningRef.current(), 500);
    }
  }, []);

  /** Auto-open mic: MediaRecorder+Whisper when key set, else browser speech. */
  const startServerVoiceCapture = useCallback(async () => {
    if (processingRef.current) return;
    const activeToken = tokenRef.current;
    if (!activeToken) return;

    stopListening();
    answerBufferRef.current = "";
    lastHeardRef.current = "";
    speechStartedRef.current = false;
    recordedChunksRef.current = [];
    setPartialHeard("");
    setAgentState("listening");
    listeningRef.current = true;
    setMicHint("Listening — speak naturally, then pause ~2s");

    if (audioRef.current) audioRef.current.pause();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();

    const stream = await startLevelMeter(micDeviceIdRef.current || undefined);
    if (!stream) {
      setMicHint("Mic blocked — allow mic in the address bar, then Sarah will hear you next turn");
      return;
    }

    const useWhisper = Boolean(aiStatus?.stt);

    if (useWhisper) {
      try {
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
        };
        recorder.start(250);
        setMicReady(true);

        const armVadCommit = () => {
          if (vadTimerRef.current) clearTimeout(vadTimerRef.current);
          vadTimerRef.current = setTimeout(() => {
            if (!listeningRef.current || processingRef.current || !speechStartedRef.current) return;
            if (micLevelRef.current > 0.04) {
              armVadCommit();
              return;
            }
            void flushVoiceRecording();
          }, SILENCE_MS);
        };

        const watch = () => {
          if (!listeningRef.current || processingRef.current) return;
          if (micLevelRef.current > 0.05) {
            if (!speechStartedRef.current) {
              speechStartedRef.current = true;
              setMicHint("Hearing you… pause when finished");
              setPartialHeard("…");
            }
            armVadCommit();
          }
          window.setTimeout(watch, 100);
        };
        watch();
        return;
      } catch (e) {
        console.warn("[mic] MediaRecorder failed, falling back to browser speech", e);
      }
    }

    // Browser speech path (no Groq key / MediaRecorder failed)
    const speechWin = window as SpeechWindow;
    const SR = speechWin.SpeechRecognition || speechWin.webkitSpeechRecognition;
    if (!SR) {
      setMicHint("Type your answer below — this browser has no speech engine");
      return;
    }

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = voiceLangRef.current || "en-IN";

    recognition.onresult = (event) => {
      let interim = "";
      let chunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) chunk += piece + " ";
        else interim += piece;
      }
      if (chunk.trim()) {
        answerBufferRef.current = `${answerBufferRef.current} ${chunk}`.replace(/\s+/g, " ").trim();
      }
      const heard = (answerBufferRef.current || interim).trim();
      lastHeardRef.current = heard;
      setPartialHeard(heard);
      if (heard) {
        setMicHint("Hearing you… pause when finished");
        armSilenceCommit();
      }
    };
    recognition.onerror = (ev) => {
      const err = ev?.error;
      if (err === "no-speech" || err === "aborted") return;
      if (err === "not-allowed" || err === "service-not-allowed") {
        setMicHint("Mic permission denied — allow mic, or type below");
        listeningRef.current = false;
        return;
      }
      if (err === "network") {
        setMicHint("Speech offline — add Groq key for Whisper, or type below");
      }
    };
    recognition.onend = () => {
      if (listeningRef.current && !processingRef.current) {
        try {
          recognition.start();
        } catch {
          window.setTimeout(() => {
            if (!processingRef.current) startListeningRef.current();
          }, 400);
        }
      }
    };
    try {
      recognition.start();
      setMicReady(true);
    } catch {
      setMicHint("Could not open mic — type your answer below");
      listeningRef.current = false;
    }
  }, [stopListening, startLevelMeter, flushVoiceRecording, aiStatus?.stt, armSilenceCommit]);

  const startListening = useCallback(() => {
    if (processingRef.current) return;
    void startServerVoiceCapture();
  }, [startServerVoiceCapture]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Safety net: if UI sits stuck after start finished (remount wiped state)
  useEffect(() => {
    if (phase !== "live" || !token) return;
    const stuckText = /connecting|getting ready|joining/i.test(question);
    if (!stuckText && agentState === "listening") return;
    const id = window.setTimeout(() => {
      if (processingRef.current || listeningRef.current) return;
      // Still starting — wait
      if (startedForTokenRef.current === `starting:${token}`) return;
      if (loadInterviewSnap(token) || liveStartedTokens.has(token)) {
        void resumeAfterRemount(token);
      }
    }, 8000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, agentState, question, token]);

  async function extractUpload(file: File, kind: "jd" | "resume") {
    setUploading(kind);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/v1/interview-links/extract-document`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      if (kind === "jd") {
        setJd(data.text);
        setJdFileName(file.name);
      } else {
        setResume(data.text);
        setResumeFileName(file.name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function createAndStart() {
    if (!consent) {
      setError("Please consent to continue.");
      return;
    }
    if (!jd.trim() || !resume.trim()) {
      setError("Please provide both a job description and a resume.");
      return;
    }
    // Stay on this page — no remount. ElevenLabs-style: click → agent greets → mic opens.
    setPhase("live");
    setAgentState("thinking");
    setQuestion(`${interviewer} is getting ready…`);
    setMicHint("Starting…");
    setError("");
    setConnection("connecting");
    // User-gesture: open mic now and KEEP it for the whole interview
    void startLevelMeter();
    try {
      const created = await api<InterviewInfo & { token: string }>("/api/v1/interview-links/self-serve", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          jd_text: jd,
          resume_text: resume,
          interviewer_name: interviewer,
          duration_minutes: 30,
        }),
      });
      setToken(created.token);
      setInfo(created);
      setSecondsLeft((created.duration_minutes || 30) * 60);
      // Update URL without remounting (remount was wiping mic + greeting)
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/interview/${created.token}`);
      }
      await beginLive(created.token, created.interviewer_name || interviewer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start interview");
      setPhase("setup");
      setConnection("offline");
      startedForTokenRef.current = null;
    }
  }

  async function beginLive(activeToken: string, name: string) {
    if (liveStartedTokens.has(activeToken)) {
      // Another call already claimed this token — recover if greeting exists
      if (loadInterviewSnap(activeToken)?.reply) {
        void resumeAfterRemount(activeToken);
      }
      return;
    }
    if (
      startedForTokenRef.current === `done:${activeToken}` ||
      startedForTokenRef.current === `starting:${activeToken}`
    ) {
      return;
    }
    liveStartedTokens.add(activeToken);
    startedForTokenRef.current = `starting:${activeToken}`;

    setPhase("live");
    setConnection("connecting");
    setAgentState("thinking");
    setQuestion(`${name} is joining — question will show here…`);
    setMicHint("Connecting…");
    try {
      await api(`/api/v1/interview-links/${activeToken}/consent`, {
        method: "POST",
        body: JSON.stringify({ consent: true }),
        auth: false,
      }).catch(() => null);

      // Never block on audio unlock — this was hanging the whole interview
      try {
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.volume = 0;
        audioRef.current.src =
          "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
        await Promise.race([
          audioRef.current.play().catch(() => null),
          new Promise((r) => setTimeout(r, 400)),
        ]);
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 1;
      } catch {
        /* ignore */
      }

      const res = await api<AnswerApiResponse>(`/api/v1/interview-links/${activeToken}/start`, {
        method: "POST",
        auth: false,
      });
      if (!res?.reply) {
        throw new Error("Sarah did not return a greeting. Try again.");
      }
      startedForTokenRef.current = `done:${activeToken}`;
      setPhase("live");
      setConnection("live");
      setInterviewer((res.interviewer_name || name || "Sarah") as "Sarah" | "Rahul");
      setInfo((prev) => {
        const next: InterviewInfo = {
          ...prev,
          candidate_name: res.candidate_name || prev?.candidate_name,
        };
        saveInterviewSnap(activeToken, {
          reply: res.reply,
          interviewer_name: res.interviewer_name || name,
          candidate_name: next.candidate_name,
          role: next.role || prev?.role,
          duration_minutes: next.duration_minutes || 30,
        });
        return next;
      });
      setTranscript([{ role: "interviewer", content: res.reply }]);
      setQuestion(res.reply || "");
      setMicHint(`${res.interviewer_name || name} is speaking…`);
      console.log("%cAI:", "color:#2ec4b6;font-weight:bold", res.reply);
      // Prefer browser TTS for greeting (instant); server audio optional
      await playAgentSpeech(res.reply, res.audio_base64, res.interviewer_name || name);
      micOpenedTokens.add(activeToken);
      openMicAfterAgent();
    } catch (e) {
      liveStartedTokens.delete(activeToken);
      startedForTokenRef.current = null;
      setError(e instanceof Error ? e.message : "Could not start interview");
      setPhase("error");
      setConnection("offline");
      setMicHint("Start failed");
    }
  }

  useEffect(() => {
    if (!initialToken) return;

    const snap = loadInterviewSnap(initialToken);
    if (snap?.reply) {
      void resumeAfterRemount(initialToken);
      return;
    }

    // Prior attempt claimed the token but never got a greeting — allow retry
    if (liveStartedTokens.has(initialToken) && !snap?.reply) {
      liveStartedTokens.delete(initialToken);
      startedForTokenRef.current = null;
    }

    if (
      startedForTokenRef.current === `starting:${initialToken}` ||
      startedForTokenRef.current === `done:${initialToken}`
    ) {
      return;
    }

    api<InterviewInfo>(`/api/v1/interview-links/${initialToken}`, { auth: false })
      .then(async (data) => {
        setInfo(data);
        setInterviewer((data.interviewer_name || "Sarah") as "Sarah" | "Rahul");
        setSecondsLeft((data.duration_minutes || 30) * 60);
        setConsent(true);
        await beginLive(initialToken, data.interviewer_name || "Sarah");
      })
      .catch((e) => {
        setError(e.message);
        setPhase("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  async function endInterview() {
    stopListening();
    if (token) {
      await api(`/api/v1/interview-links/${token}/finish`, { method: "POST", auth: false }).catch(() => null);
    }
    setPhase("done");
    setAgentState("idle");
  }

  if (phase === "setup") {
    return (
      <Shell>
        <Brand />
        <h1 className="font-display mt-6 text-4xl">Voice interview</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Upload or paste a JD and resume. Then talk with {interviewer} like a normal interview — pause for 3 seconds
          when you finish an answer and they’ll continue.
        </p>

        <div className="mt-8 grid gap-4 max-w-3xl">
          <div>
            <label className="label">Interviewer</label>
            <div className="flex gap-3">
              {(["Sarah", "Rahul"] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setInterviewer(name)}
                  className={`btn ${interviewer === name ? "btn-primary" : "btn-secondary"}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Job description</label>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf"
              className="mb-2 block w-full text-sm text-[var(--muted)]"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) extractUpload(f, "jd");
              }}
            />
            {jdFileName && (
              <p className="mb-2 text-xs text-[var(--ok)]">
                Loaded {jdFileName}
                {uploading === "jd" ? "…" : ""}
              </p>
            )}
            <textarea
              className="input min-h-36"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the job description here, or upload PDF/DOCX/TXT above…"
            />
          </div>

          <div>
            <label className="label">Your resume</label>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf"
              className="mb-2 block w-full text-sm text-[var(--muted)]"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) extractUpload(f, "resume");
              }}
            />
            {resumeFileName && (
              <p className="mb-2 text-xs text-[var(--ok)]">
                Loaded {resumeFileName}
                {uploading === "resume" ? "…" : ""}
              </p>
            )}
            <textarea
              className="input min-h-36"
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder="Paste YOUR resume here (with your real name), or upload PDF/DOCX/TXT above…"
            />
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I consent to an AI voice interview and transcription for evaluation.
          </label>
          {error && <p className="text-[var(--danger)] text-sm">{error}</p>}
          <button className="btn btn-primary w-fit" onClick={createAndStart} disabled={!!uploading}>
            Start interview with {interviewer}
          </button>
        </div>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <Brand />
        <p className="mt-8 text-[var(--danger)]">{error || "Something went wrong"}</p>
        <p className="mt-2 max-w-lg text-sm text-[var(--muted)]">
          Usually this means the API is unreachable. Keep the API running on port{" "}
          <code>8001</code>, then open the setup page again.
        </p>
        <Link className="btn btn-primary mt-6 inline-flex" href="/interview/try">
          Back to setup
        </Link>
      </Shell>
    );
  }

  if (phase === "done") {
    return (
      <div className="zara-room grid place-items-center p-5" data-testid="candidate-complete-room">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 text-2xl">
            ✓
          </div>
          <p className="mt-8 font-mono-zara text-[10px] text-emerald-300">Interview complete</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Thanks for your time.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Your responses have been submitted. The hiring team will be in touch with next steps.
          </p>
          <div className="mt-8 rounded-lg border border-white/10 bg-white/[.03] p-5 text-left text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Interviewer</span>
              <span>{interviewer}</span>
            </div>
            <div className="mt-3 flex justify-between">
              <span className="text-slate-400">Role</span>
              <span>{info?.role || "Technical interview"}</span>
            </div>
            <div className="mt-3 flex justify-between">
              <span className="text-slate-400">Time left</span>
              <span>{timer}</span>
            </div>
          </div>
          <Link className="btn btn-primary mt-6 inline-flex w-full" href="/interview/try">
            Back to start
          </Link>
        </div>
      </div>
    );
  }

  const statusLabel =
    agentState === "speaking"
      ? `${interviewer} is speaking`
      : agentState === "thinking"
        ? "Thinking…"
        : agentState === "listening"
          ? "Listening…"
          : "Connecting…";

  const statusClass =
    agentState === "listening" ? "listening" : agentState === "thinking" ? "thinking" : "";

  const qIndex = Math.min(transcript.filter((t) => t.role === "interviewer").length || 1, 8);
  const progressPct = Math.max(12, (qIndex / 8) * 100);

  return (
    <div className="zara-room" data-testid="candidate-active-room">
      <div className="zara-glow" />

      <header className="relative flex h-16 items-center justify-between border-b border-white/10 px-5 sm:px-8">
        <div>
          <span className="font-mono-zara text-sm font-semibold tracking-[.28em]">ZARA</span>
          <span className="ml-4 hidden border-l border-white/15 pl-4 text-xs text-slate-500 sm:inline">
            {info?.role || "Technical interview"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="font-mono-zara tracking-normal normal-case">{timer}</span>
          {info?.candidate_name && <span className="hidden sm:inline">{info.candidate_name}</span>}
        </div>
      </header>

      <main className="relative mx-auto flex min-h-[calc(100svh-64px)] max-w-6xl flex-col items-center justify-center px-5 py-8">
        <div className="mb-8 flex w-full max-w-3xl items-center justify-between">
          <div>
            <p className="font-mono-zara text-[10px] text-slate-500">Question {qIndex} of 8</p>
            <div className="mt-3 h-1 w-48 overflow-hidden rounded-full bg-white/10 sm:w-72">
              <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
        </div>

        <section className="flex flex-col items-center text-center">
          <div className="relative">
            <div
              className={`absolute -inset-8 rounded-full border ${
                agentState === "thinking" ? "border-violet-400/25" : "border-blue-400/20"
              }`}
            />
            <InterviewerAvatar
              name={interviewer}
              size="lg"
              pulse={agentState === "speaking" || agentState === "listening"}
            />
          </div>

          <h1 className="mt-10 text-xl font-medium">{interviewer}</h1>
          <p className="mt-2 text-sm text-slate-400" aria-live="polite">
            {micHint || statusLabel}
          </p>

          <div className="mt-6 w-[min(520px,90vw)]">
            <Waveform
              active={agentState === "speaking" || agentState === "listening"}
              thinking={agentState === "thinking"}
              level={agentState === "listening" ? Math.max(0.2, micLevel) : agentState === "speaking" ? 0.55 : 0.15}
            />
          </div>

          <div className="mt-4 min-h-16 max-w-xl text-sm leading-7 text-slate-300">
            {(partialHeard || question) && (
              <span className="inline-block rounded-lg border border-white/10 bg-white/[.035] px-4 py-3 text-left">
                “{partialHeard || question}”
              </span>
            )}
          </div>
        </section>

        <div className="mt-10 flex flex-col items-center gap-3">
          <div
            className={`relative grid size-20 place-items-center rounded-full border transition-transform ${
              agentState === "listening"
                ? "border-blue-400/40 bg-blue-500/15 text-blue-200 shadow-[0_0_40px_rgba(59,130,246,.15)]"
                : "border-white/15 bg-white/[.04] text-slate-400"
            } ${agentState === "listening" ? "mic-pulse" : ""}`}
            aria-label="Microphone"
          >
            <MicIcon hot={micLevel > 0.04 || agentState === "listening"} />
          </div>
          <span className="text-xs text-slate-500">
            {agentState === "listening"
              ? "Mic open — speak, then pause ~2s"
              : agentState === "speaking"
                ? `${interviewer} is talking`
                : "Please wait…"}
          </span>
        </div>

        {agentState === "listening" && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <select
              className="input max-w-xs text-sm"
              value={micDeviceId}
              onChange={(e) => {
                const id = e.target.value;
                setMicDeviceId(id);
                void startLevelMeter(id || undefined).then(() => startListeningRef.current());
              }}
            >
              {micDevices.length === 0 ? (
                <option value="">Default microphone</option>
              ) : (
                micDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))
              )}
            </select>
            <select
              className="input max-w-[9rem] text-sm"
              value={voiceLang}
              onChange={(e) => {
                setVoiceLang(e.target.value as VoiceLang);
                startListeningRef.current();
              }}
            >
              <option value="en-IN">English (India)</option>
              <option value="en-US">English (US)</option>
              <option value="hi-IN">Hindi</option>
            </select>
          </div>
        )}

        <form
          className="mt-8 w-full max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (!answer.trim()) return;
            submitAnswer(answer);
            setAnswer("");
          }}
        >
          <textarea
            ref={answerBoxRef}
            className="input min-h-20 text-sm"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Text fallback if voice fails…"
          />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={!answer.trim() || agentState === "thinking"}
            >
              Send answer
            </button>
            <button type="button" className="btn btn-secondary" onClick={endInterview}>
              End interview
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTranscriptOpen((v) => !v)}
            >
              Transcript
            </button>
          </div>
        </form>

        {aiStatus && !aiStatus.ready && (
          <p className="mt-4 max-w-md text-center text-xs text-slate-500">
            Tip: add Groq LLM_API_KEY for Whisper STT + smarter follow-ups.
          </p>
        )}
      </main>

      {transcriptOpen && (
        <aside className="absolute right-4 top-20 hidden w-72 rounded-lg border border-white/10 bg-[#131720]/95 p-4 shadow-2xl backdrop-blur-sm xl:block">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-medium">Live transcript</p>
            <span className="font-mono-zara text-[10px] tracking-normal text-emerald-300">LIVE</span>
          </div>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {transcript.length === 0 ? (
              <p className="text-xs text-slate-500">Conversation will show here…</p>
            ) : (
              transcript.slice(-10).map((t, i) => (
                <div key={`${i}-${t.content.slice(0, 20)}`}>
                  <p
                    className={`font-mono-zara text-[10px] tracking-normal ${
                      t.role === "interviewer" ? "text-blue-300" : "text-emerald-300"
                    }`}
                  >
                    {t.role === "interviewer" ? interviewer.toUpperCase() : "YOU"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{t.content}</p>
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {error && (
        <p className="absolute bottom-4 left-1/2 w-[min(520px,92vw)] -translate-x-1/2 text-center text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

function Brand() {
  return <div className="font-mono-zara text-sm font-semibold tracking-[.28em]">ZARA</div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">{children}</div>;
}

function MicIcon({ hot }: { hot: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        fill={hot ? "#93c5fd" : "currentColor"}
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke={hot ? "#93c5fd" : "currentColor"}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
