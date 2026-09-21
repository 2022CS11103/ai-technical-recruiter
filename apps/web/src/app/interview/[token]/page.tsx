"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_URL, api } from "@/lib/api";
import { MicroInterviewRoom } from "@/components/interview/MicroInterviewRoom";

type Phase = "setup" | "preparing" | "briefing" | "live" | "done" | "error";
type VoiceLang = "en-IN" | "hi-IN" | "en-US";

type InterviewInfo = {
  role?: string;
  candidate_name?: string;
  candidate_id?: string;
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
  candidate_id?: string;
  topic?: {
    kind?: string;
    label?: string | null;
    project?: string | null;
    claim?: string | null;
    competency?: string | null;
    section?: string | null;
  };
  meta?: Record<string, unknown>;
  state?: Record<string, unknown>;
};

const SAMPLE_JD = "";
const SAMPLE_RESUME = "";
const MATERIALS_KEY = "zara_saved_materials";

type SavedMaterials = {
  jd: string;
  resume: string;
  jdFileName?: string;
  resumeFileName?: string;
  interviewer?: "Sarah" | "Rahul";
};

function loadSavedMaterials(): SavedMaterials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MATERIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedMaterials;
    if (!parsed?.jd?.trim() || !parsed?.resume?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveMaterials(data: SavedMaterials) {
  if (typeof window === "undefined") return;
  try {
    if (!data.jd.trim() || !data.resume.trim()) return;
    localStorage.setItem(MATERIALS_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

function clearSavedMaterials() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(MATERIALS_KEY);
  } catch {
    /* ignore */
  }
}

function looksLikeDontKnow(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    /\b(i don't know|i do not know|dont know|don't know|no idea|not sure|skip this|pass on this|pata nahi|nahi pata)\b/.test(
      lower
    ) && lower.split(/\s+/).length < 16
  );
}

function isSubstantiveAnswer(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  if (looksLikeDontKnow(cleaned)) return true;
  const words = cleaned.match(/[a-zA-Z']+/g) || [];
  const fillers = new Set([
    "um",
    "uh",
    "erm",
    "hmm",
    "hm",
    "ah",
    "oh",
    "ok",
    "okay",
    "yes",
    "yeah",
    "yep",
    "no",
    "nope",
    "right",
    "sure",
    "hello",
    "hi",
    "hey",
    "thanks",
    "thank",
    "you",
  ]);
  const content = words.map((w) => w.toLowerCase()).filter((w) => !fillers.has(w));
  return content.length >= 3;
}

const SILENCE_MS = 2800;
/** Survives React Strict Mode remounts so greeting TTS only plays once per token. */
const liveStartedTokens = new Set<string>();
/** Tokens where mic was already opened after greeting (avoid double open on remount). */
const micOpenedTokens = new Set<string>();

/** Chrome truncates long utterances — speak one sentence at a time. */
function splitSpeakChunks(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    if ((buf + " " + part).trim().length > 180 && buf) {
      chunks.push(buf.trim());
      buf = part;
    } else {
      buf = `${buf} ${part}`.trim();
    }
  }
  if (buf) chunks.push(buf.trim());
  return chunks.length ? chunks : [cleaned];
}

function writeWavString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function encodeWav(buffer: AudioBuffer): Blob {
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / channels;
  }
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(bytes);
  writeWavString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeWavString(view, 8, "WAVE");
  writeWavString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWavString(view, 36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) view.setInt16(offset, pcm[i], true);
  return new Blob([bytes], { type: "audio/wav" });
}

async function blobToWav(blob: Blob): Promise<Blob> {
  const AC = window.AudioContext || (window as SpeechWindow).webkitAudioContext;
  if (!AC) return blob;
  const ctx = new AC();
  try {
    const raw = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(raw.slice(0));
    return encodeWav(audio);
  } finally {
    await ctx.close().catch(() => null);
  }
}

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
  const [phase, setPhase] = useState<Phase>(initialToken ? "briefing" : "setup");
  const [jd, setJd] = useState(SAMPLE_JD);
  const [resume, setResume] = useState(SAMPLE_RESUME);
  const [jdFileName, setJdFileName] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [materialsSaved, setMaterialsSaved] = useState(false);
  const [interviewer, setInterviewer] = useState<"Sarah" | "Rahul">("Sarah");
  const [info, setInfo] = useState<InterviewInfo | null>(null);
  const [connection, setConnection] = useState<"offline" | "connecting" | "live">(
    initialToken ? "connecting" : "offline"
  );
  const [agentState, setAgentState] = useState<"listening" | "thinking" | "speaking" | "idle">("idle");
  const [question, setQuestion] = useState("");
  const [spokenDisplay, setSpokenDisplay] = useState("");
  const [topicLabel, setTopicLabel] = useState<string | null>(null);
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
  const aiStatusRef = useRef(aiStatus);
  aiStatusRef.current = aiStatus;
  const maxRecTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechUnlockedRef = useRef(false);

  const timer = useMemo(() => {
    const m = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
    const s = (secondsLeft % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [secondsLeft]);

  useEffect(() => {
    const saved = loadSavedMaterials();
    if (!saved) return;
    setJd(saved.jd);
    setResume(saved.resume);
    setJdFileName(saved.jdFileName || "");
    setResumeFileName(saved.resumeFileName || "");
    if (saved.interviewer === "Sarah" || saved.interviewer === "Rahul") {
      setInterviewer(saved.interviewer);
    }
    setMaterialsSaved(true);
    setConsent(true);
  }, []);

  const persistMaterialsNow = useCallback(
    (next?: Partial<SavedMaterials>) => {
      const payload: SavedMaterials = {
        jd: next?.jd ?? jd,
        resume: next?.resume ?? resume,
        jdFileName: next?.jdFileName ?? jdFileName,
        resumeFileName: next?.resumeFileName ?? resumeFileName,
        interviewer: next?.interviewer ?? interviewer,
      };
      if (!payload.jd.trim() || !payload.resume.trim()) return;
      saveMaterials(payload);
      setMaterialsSaved(true);
    },
    [jd, resume, jdFileName, resumeFileName, interviewer]
  );

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

        if (micAudioCtxRef.current) {
          await micAudioCtxRef.current.close().catch(() => null);
          micAudioCtxRef.current = null;
        }
        micAnalyserRef.current = null;

        const AC = window.AudioContext || (window as SpeechWindow).webkitAudioContext;
        if (!AC) {
          setMicHint("AudioContext unavailable in this browser");
          setMicReady(true);
          return stream;
        }
        const ctx = new AC();
        micAudioCtxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.15;
        const gain = ctx.createGain();
        gain.gain.value = 10;
        source.connect(gain);
        gain.connect(analyser);
        micAnalyserRef.current = analyser;

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
      if (typeof window === "undefined" || !window.speechSynthesis || !text.trim()) {
        resolve();
        return;
      }
      const synth = window.speechSynthesis;
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 150));
      if (playId !== playIdRef.current) {
        resolve();
        return;
      }

      let voices = synth.getVoices();
      if (!voices.length) {
        await new Promise<void>((r) => {
          const done = () => r();
          synth.addEventListener("voiceschanged", done, { once: true });
          setTimeout(done, 700);
        });
        voices = synth.getVoices();
      }

      const preferFemale = voiceHint.toLowerCase() === "sarah";
      const picked =
        voices.find((v) =>
          preferFemale
            ? /jenny|zira|samantha|neerja|female|google uk english female/i.test(v.name)
            : /guy|david|mark|prabhat|ryan|male|google uk english male/i.test(v.name)
        ) ||
        voices.find((v) => /en-IN|en-GB|en-US/i.test(v.lang)) ||
        voices[0];

      let revealed = 0;
      const revealTo = (abs: number) => {
        if (playId !== playIdRef.current) return;
        revealed = Math.max(revealed, Math.min(text.length, abs));
        setSpokenDisplay(text.slice(0, revealed));
      };
      setSpokenDisplay("");

      const speakOne = (chunk: string, base: number) =>
        new Promise<void>((done) => {
          if (playId !== playIdRef.current) {
            done();
            return;
          }
          const utter = new SpeechSynthesisUtterance(chunk);
          if (picked) utter.voice = picked;
          utter.lang = picked?.lang || "en-US";
          utter.rate = 0.98;
          utter.pitch = preferFemale ? 1.05 : 1.0;
          utter.volume = 1;
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            revealTo(base + chunk.length);
            done();
          };
          utter.onboundary = (ev: SpeechSynthesisEvent) => {
            if (playId !== playIdRef.current) return;
            const local = typeof ev.charIndex === "number" ? ev.charIndex : 0;
            let end = base + local;
            while (end < text.length && !/\s/.test(text[end]!)) end += 1;
            revealTo(Math.max(end, base + local + 1));
          };
          utter.onend = finish;
          utter.onerror = finish;
          // Fallback typewriter if browser skips onboundary
          const words = chunk.split(/(\s+)/).filter(Boolean);
          let wi = 0;
          let acc = base;
          const tick = window.setInterval(() => {
            if (settled || playId !== playIdRef.current) {
              window.clearInterval(tick);
              return;
            }
            if (wi >= words.length) {
              window.clearInterval(tick);
              return;
            }
            acc += words[wi]!.length;
            wi += 1;
            revealTo(acc);
          }, Math.max(90, Math.min(220, 1800 / Math.max(words.length, 1))));

          const waitMs = Math.min(60000, 2500 + chunk.length * 70);
          const safety = window.setTimeout(finish, waitMs);
          try {
            synth.resume();
          } catch {
            /* ignore */
          }
          synth.speak(utter);
          const poke = window.setTimeout(() => {
            try {
              if (!settled && synth.paused) synth.resume();
            } catch {
              /* ignore */
            }
          }, 600);
          utter.addEventListener("end", () => {
            window.clearTimeout(safety);
            window.clearTimeout(poke);
            window.clearInterval(tick);
          });
          utter.addEventListener("error", () => {
            window.clearTimeout(safety);
            window.clearTimeout(poke);
            window.clearInterval(tick);
          });
        });

      setAgentState("speaking");
      let cursor = 0;
      for (const chunk of splitSpeakChunks(text)) {
        if (playId !== playIdRef.current) break;
        const found = text.indexOf(chunk, cursor);
        const base = found >= 0 ? found : cursor;
        await speakOne(chunk, base);
        cursor = base + chunk.length;
        revealTo(cursor);
        await new Promise((r) => setTimeout(r, 60));
      }
      if (playId === playIdRef.current) setSpokenDisplay(text);
      resolve();
    });
  }, []);

  const playAgentSpeech = useCallback(
    async (text: string, _audioB64?: string | null, name?: string, opts?: { keepPinned?: boolean }) => {
      const playId = ++playIdRef.current;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch {
          /* ignore */
        }
      }

      if (!opts?.keepPinned) {
        setQuestion(text);
        setSpokenDisplay("");
      }
      setAgentState("speaking");
      setMicHint(`${name || interviewer} is speaking…`);
      // Always use browser TTS. Waiting on server edge-tts was hanging /answer
      // so the UI never heard Sarah and never reopened the mic.
      if (playId === playIdRef.current) {
        await speakBrowser(text, name || interviewer, playId);
      }
      if (playId === playIdRef.current && !opts?.keepPinned) {
        setSpokenDisplay(text);
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
    if (maxRecTimerRef.current) {
      clearTimeout(maxRecTimerRef.current);
      maxRecTimerRef.current = null;
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
        setSpokenDisplay(snap.reply);
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
            setSpokenDisplay(res.reply);
            setTopicLabel(res.topic?.label || null);
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
      if (!isSubstantiveAnswer(text)) {
        setMicHint("Need a real answer (or say “I don’t know”) — still on this question");
        answerBufferRef.current = "";
        lastHeardRef.current = "";
        setPartialHeard("");
        setAgentState("listening");
        window.setTimeout(() => {
          if (!processingRef.current) startListeningRef.current();
        }, 350);
        return;
      }
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
          if (res.candidate_id) {
            setInfo((prev) => ({ ...prev, candidate_id: res.candidate_id }));
            try {
              sessionStorage.setItem("zara_last_candidate_id", res.candidate_id);
            } catch {
              /* ignore */
            }
          }
          setPhase("done");
          setAgentState("idle");
          const bye = "Thanks for your time today. That wraps up the interview.";
          setQuestion(bye);
          setTopicLabel(null);
          setMicHint("Interview finished");
          console.log("%cAI:", "color:#2ec4b6;font-weight:bold", bye);
          await playAgentSpeech(bye, res.audio_base64, interviewer);
          return;
        }
        const reply = res.reply || "Thanks — let's continue.";
        console.log("%cAI:", "color:#2ec4b6;font-weight:bold", reply);
        const action = String(res.meta?.action || "");
        if (action === "AWAIT_ANSWER") {
          setMicHint("Still on this question — answer it, or say you don’t know");
          setTranscript((t) => [...t, { role: "interviewer", content: reply }]);
          await playAgentSpeech(
            "Still need your answer on that — take your time, or say you don’t know.",
            res.audio_base64,
            interviewer,
            { keepPinned: true }
          );
          openMicAfterAgent();
          return;
        }
        setTopicLabel(res.topic?.label || null);
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
    const rawBlob = new Blob(recordedChunksRef.current, { type: rec.mimeType || "audio/webm" });
    recordedChunksRef.current = [];
    speechStartedRef.current = false;
    if (rawBlob.size < 2500) {
      setMicHint("Didn’t catch that — speak again, then tap I’m done");
      window.setTimeout(() => startListeningRef.current(), 400);
      return;
    }
    try {
      let upload = rawBlob;
      let filename = "answer.wav";
      try {
        upload = await blobToWav(rawBlob);
      } catch (convErr) {
        console.warn("[stt] wav convert failed, sending original", convErr);
        filename = rec.mimeType?.includes("mp4") ? "answer.mp4" : "answer.webm";
      }
      const fd = new FormData();
      fd.append("file", upload, filename);
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
          setMicHint("Couldn’t hear clearly — speak again, then tap I’m done");
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

    const stream = await startLevelMeter(micDeviceIdRef.current || undefined);
    if (!stream) {
      setMicHint("Mic blocked — allow mic in the address bar, then Sarah will hear you next turn");
      return;
    }

    const useWhisper = Boolean(aiStatusRef.current?.stt);

    if (useWhisper) {
      try {
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : MediaRecorder.isTypeSupported("audio/mp4")
              ? "audio/mp4"
              : "";
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            recordedChunksRef.current.push(ev.data);
            const total = recordedChunksRef.current.reduce((n, b) => n + b.size, 0);
            if (total > 2500 && !speechStartedRef.current) {
              speechStartedRef.current = true;
              setMicHint("Hearing you… pause ~2s or tap I’m done");
              setPartialHeard("…");
            }
          }
        };
        recorder.start();
        setMicReady(true);

        const armVadCommit = () => {
          if (vadTimerRef.current) clearTimeout(vadTimerRef.current);
          vadTimerRef.current = setTimeout(() => {
            if (!listeningRef.current || processingRef.current || !speechStartedRef.current) return;
            if (micLevelRef.current > 0.035) {
              armVadCommit();
              return;
            }
            void flushVoiceRecording();
          }, SILENCE_MS);
        };

        const watch = () => {
          if (!listeningRef.current || processingRef.current) return;
          if (micLevelRef.current > 0.028) {
            if (!speechStartedRef.current) {
              speechStartedRef.current = true;
              setMicHint("Hearing you… pause ~2s or tap I’m done");
              setPartialHeard("…");
            }
            armVadCommit();
          }
          window.setTimeout(watch, 80);
        };
        watch();
        if (maxRecTimerRef.current) clearTimeout(maxRecTimerRef.current);
        maxRecTimerRef.current = setTimeout(() => {
          if (listeningRef.current && !processingRef.current) void flushVoiceRecording();
        }, 20000);
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
  }, [stopListening, startLevelMeter, flushVoiceRecording, armSilenceCommit]);

  const startListening = useCallback(() => {
    if (processingRef.current) return;
    void startServerVoiceCapture();
  }, [startServerVoiceCapture]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Chrome pauses speechSynthesis after ~15s idle; keep it awake during the interview.
  useEffect(() => {
    if (phase !== "live") return;
    const id = window.setInterval(() => {
      try {
        if (window.speechSynthesis?.paused) window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [phase]);

  function unlockSpeech() {
    if (speechUnlockedRef.current || typeof window === "undefined") return;
    speechUnlockedRef.current = true;
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        const warm = new SpeechSynthesisUtterance(".");
        warm.volume = 0;
        synth.speak(warm);
        synth.cancel();
      }
    } catch {
      /* ignore */
    }
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.volume = 0;
      audioRef.current.src =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
      void audioRef.current.play().finally(() => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.volume = 1;
        }
      });
    } catch {
      /* ignore */
    }
  }

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
        persistMaterialsNow({ jd: data.text, jdFileName: file.name });
      } else {
        setResume(data.text);
        setResumeFileName(file.name);
        persistMaterialsNow({ resume: data.text, resumeFileName: file.name });
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
    // Stay on this page — briefing first (micro1-style), then voice starts on CTA.
    setPhase("briefing");
    setAgentState("idle");
    setQuestion("");
    setMicHint("Mic idle");
    setError("");
    setConnection("connecting");
    unlockSpeech();
    void startLevelMeter();
    try {
      const created = await api<InterviewInfo & { token: string }>("/api/v1/interview-links/self-serve", {
        method: "POST",
        body: JSON.stringify({
          jd_text: jd,
          resume_text: resume,
          interviewer_name: interviewer,
          duration_minutes: 30,
        }),
      });
      setToken(created.token);
      setInfo(created);
      if (created.candidate_id) {
        try {
          sessionStorage.setItem("zara_last_candidate_id", created.candidate_id);
        } catch {
          /* ignore */
        }
      }
      setSecondsLeft((created.duration_minutes || 30) * 60);
      persistMaterialsNow({
        jd,
        resume,
        jdFileName,
        resumeFileName,
        interviewer,
      });
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/interview/${created.token}`);
      }
      setConnection("live");
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
      setTopicLabel(res.topic?.label || null);
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
        setPhase("briefing");
        setConnection("live");
        void startLevelMeter();
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
      const finished = await api<{ candidate_id?: string }>(
        `/api/v1/interview-links/${token}/finish`,
        { method: "POST", auth: false }
      ).catch(() => null);
      if (finished?.candidate_id) {
        setInfo((prev) => ({ ...prev, candidate_id: finished.candidate_id }));
        try {
          sessionStorage.setItem("zara_last_candidate_id", finished.candidate_id);
        } catch {
          /* ignore */
        }
      }
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
          Upload or paste a JD and resume once — they stay saved until you change them. Talk with {interviewer} like a
          normal interview; pause ~3 seconds when you finish an answer.
        </p>
        {materialsSaved && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800">
            <span>Saved JD & resume ready — reuse without re-uploading.</span>
            <button
              type="button"
              className="text-xs font-semibold underline underline-offset-2"
              onClick={() => {
                clearSavedMaterials();
                setJd("");
                setResume("");
                setJdFileName("");
                setResumeFileName("");
                setMaterialsSaved(false);
              }}
            >
              Clear & replace
            </button>
          </div>
        )}

        <div className="mt-8 grid gap-4 max-w-3xl">
          <div>
            <label className="label">Interviewer</label>
            <div className="flex gap-3">
              {(["Sarah", "Rahul"] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setInterviewer(name);
                    persistMaterialsNow({ interviewer: name });
                  }}
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
              onChange={(e) => {
                setJd(e.target.value);
                setMaterialsSaved(false);
              }}
              onBlur={() => persistMaterialsNow()}
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
              onChange={(e) => {
                setResume(e.target.value);
                setMaterialsSaved(false);
              }}
              onBlur={() => persistMaterialsNow()}
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
    const dossierId = info?.candidate_id;
    return (
      <div className="micro-room grid place-items-center p-5" data-testid="candidate-complete-room">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-white text-emerald-600 text-2xl shadow">
            ✓
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">Interview complete</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Thanks for your time.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Responses are stored as evidence against the interview plan. The hiring team reviews the dossier, not a vibe score.
          </p>
          <div className="mt-8 rounded-2xl bg-white/70 p-5 text-left text-sm shadow-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Interviewer</span>
              <span className="text-slate-900">{interviewer}</span>
            </div>
            <div className="mt-3 flex justify-between">
              <span className="text-slate-500">Role</span>
              <span className="text-slate-900">{info?.role || "Technical interview"}</span>
            </div>
          </div>
          {dossierId ? (
            <Link className="micro-cta mt-6 inline-flex w-full justify-center no-underline" href={`/candidates/${dossierId}`}>
              View recruiter dossier
            </Link>
          ) : (
            <Link className="micro-cta mt-6 inline-flex w-full justify-center no-underline" href="/candidates">
              Open candidates
            </Link>
          )}
          <Link className="mt-3 inline-flex w-full justify-center text-sm text-slate-500 hover:text-slate-800" href="/interview/try">
            Back to start
          </Link>
        </div>
      </div>
    );
  }


  if (phase === "briefing" || phase === "live") {
    const qIndex = Math.min(transcript.filter((t) => t.role === "interviewer").length || 1, 8);
    const stageIndex = Math.min(3, Math.floor((qIndex - 1) / 2));
    const stages = ["Introduction", "Resume", "Technical", "Wrap-up"];
    const activeToken = token || initialToken;

    return (
      <MicroInterviewRoom
        mode={phase === "briefing" ? "briefing" : "live"}
        interviewer={interviewer}
        role={info?.role}
        candidateName={info?.candidate_name}
        timer={timer}
        question={question}
        spokenDisplay={spokenDisplay}
        topicLabel={topicLabel}
        partialHeard={partialHeard}
        agentState={agentState}
        micHint={micHint}
        micLevel={micLevel}
        micDevices={micDevices}
        micDeviceId={micDeviceId}
        voiceLang={voiceLang}
        stages={stages}
        stageIndex={stageIndex}
        error={error}
        onStart={() => {
          if (!activeToken) return;
          setConsent(true);
          unlockSpeech();
          void startLevelMeter(micDeviceId || undefined);
          void beginLive(activeToken, interviewer);
        }}
        onEnd={endInterview}
        onMicDevice={(id) => {
          setMicDeviceId(id);
          void startLevelMeter(id || undefined).then(() => startListeningRef.current());
        }}
        onVoiceLang={(lang) => {
          setVoiceLang(lang);
          startListeningRef.current();
        }}
        onMicClick={() => {
          if (agentState === "listening") {
            if (mediaRecorderRef.current) void flushVoiceRecording();
            else {
              const textAns = (answerBufferRef.current || lastHeardRef.current).trim();
              if (textAns) void submitAnswer(textAns);
              else setMicHint("Say something, then tap mic again");
            }
          } else if (agentState === "speaking" && question) {
            unlockSpeech();
            void playAgentSpeech(question, null, interviewer);
          } else if (phase === "live") {
            startListeningRef.current();
          }
        }}
        onReplay={() => {
          if (question) {
            unlockSpeech();
            void playAgentSpeech(question, null, interviewer);
          }
        }}
      />
    );
  }

  return null;
}

function Brand() {
  return <div className="font-mono-zara text-sm font-semibold tracking-[.28em]">ZARA</div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">{children}</div>;
}
