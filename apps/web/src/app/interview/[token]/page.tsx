"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { API_URL, api } from "@/lib/api";

type Phase = "setup" | "preparing" | "live" | "done" | "error";

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

function saveInterviewSnap(token: string, data: Record<string, unknown>) {
  try {
    sessionStorage.setItem(snapKey(token), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function loadInterviewSnap(token: string): any | null {
  try {
    const raw = sessionStorage.getItem(snapKey(token));
    return raw ? JSON.parse(raw) : null;
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
  const [info, setInfo] = useState<any>(null);
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
  const [showText, setShowText] = useState(false);
  const [answer, setAnswer] = useState("");
  const [transcript, setTranscript] = useState<Array<{ role: string; content: string }>>([]);
  const [secondsLeft, setSecondsLeft] = useState(30 * 60);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState<"jd" | "resume" | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
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

  const startMicMeter = useCallback(async () => {
    stopMicMeter();
    try {
      if (!micStreamRef.current) {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      }
      if (!micAudioCtxRef.current) {
        micAudioCtxRef.current = new AudioContext();
      }
      const ctx = micAudioCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      if (!micAnalyserRef.current) {
        const source = ctx.createMediaStreamSource(micStreamRef.current);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        micAnalyserRef.current = analyser;
      }
      const analyser = micAnalyserRef.current;
      const data = new Uint8Array(analyser.frequencyBinCount);
      setMicReady(true);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        setMicLevel(Math.min(1, avg * 2.2));
        micRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMicReady(false);
      setMicHint("Mic blocked — allow microphone in browser settings");
    }
  }, [stopMicMeter]);

  useEffect(() => {
    return () => {
      stopMicMeter();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      micAudioCtxRef.current?.close().catch(() => null);
      micAudioCtxRef.current = null;
    };
  }, [stopMicMeter]);

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
    stopMicMeter();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, [clearSilenceTimer, stopMicMeter]);

  const openMicAfterAgent = useCallback(() => {
    setAgentState("listening");
    setMicHint("Mic on — speak your answer (say “please repeat” if you need it again)");
    window.setTimeout(() => {
      if (!processingRef.current) startListeningRef.current();
    }, 350);
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
        setInfo((prev: any) => ({
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
          const info = await api<any>(`/api/v1/interview-links/${activeToken}`, { auth: false });
          setInfo(info);
          setInterviewer((info.interviewer_name || "Sarah") as "Sarah" | "Rahul");
          setSecondsLeft((info.duration_minutes || 30) * 60);
          const res = await api<any>(`/api/v1/interview-links/${activeToken}/start`, {
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
        const res = await api<any>(`/api/v1/interview-links/${token}/answer`, {
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
        console.log("%cAI:", "color:#2ec4b6;font-weight:bold", res.reply);
        setTranscript((t) => [...t, { role: "interviewer", content: res.reply }]);
        setMicHint(`${interviewer} is speaking…`);
        await playAgentSpeech(res.reply, res.audio_base64, interviewer);
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

  const startListening = useCallback(() => {
    if (processingRef.current) return;
    const SR =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    if (!SR) {
      setError("Browser speech recognition unavailable — use Chrome, or open text fallback.");
      setShowText(true);
      setAgentState("idle");
      return;
    }
    stopListening();
    answerBufferRef.current = "";
    lastHeardRef.current = "";
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    listeningRef.current = true;
    setAgentState("listening");
    setPartialHeard("");
    setMicHint("Mic on — speak now (bars move when voice is audible)");
    void startMicMeter();

    if (audioRef.current) audioRef.current.pause();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();

    recognition.onresult = (event: any) => {
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
        setMicHint("Hearing you ✓ — pause ~2s when finished");
        console.log("[mic] heard:", heard);
      }
      if (chunk.trim() || interim.trim()) {
        armSilenceCommit();
      }
    };
    recognition.onerror = (ev: any) => {
      const err = ev?.error as string | undefined;
      if (err === "no-speech" || err === "aborted") {
        if (err === "no-speech") {
          setMicHint("Mic on — no speech heard yet, keep talking");
        }
        return;
      }
      if (err === "not-allowed") {
        setMicHint("Mic blocked — allow microphone in the browser");
        setError("Microphone permission denied. Allow mic access, then restart the interview.");
        listeningRef.current = false;
        setAgentState("idle");
        stopMicMeter();
        return;
      }
      // Recoverable: keep interview hands-free by restarting mic
      setMicHint("Reconnecting mic…");
      if (!processingRef.current) {
        window.setTimeout(() => {
          if (!processingRef.current) startListeningRef.current();
        }, 500);
      }
    };
    recognition.onend = () => {
      if (listeningRef.current && !processingRef.current) {
        try {
          recognition.start();
        } catch {
          setMicHint("Reconnecting mic…");
          window.setTimeout(() => {
            if (!processingRef.current) startListeningRef.current();
          }, 400);
        }
      }
    };
    try {
      recognition.start();
    } catch {
      setMicHint("Reconnecting mic…");
      window.setTimeout(() => {
        if (!processingRef.current) startListeningRef.current();
      }, 400);
    }
  }, [stopListening, armSilenceCommit, startMicMeter, stopMicMeter]);

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
    // Mic permission while we still have the user-gesture from the click
    void startMicMeter().then(stopMicMeter);
    try {
      const created = await api<any>("/api/v1/interview-links/self-serve", {
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

      const res = await api<any>(`/api/v1/interview-links/${activeToken}/start`, {
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
      setInfo((prev: any) => {
        const next = { ...prev, candidate_name: res.candidate_name || prev?.candidate_name };
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

    api(`/api/v1/interview-links/${initialToken}`, { auth: false })
      .then(async (data: any) => {
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
        <a className="btn btn-primary mt-6 inline-flex" href="/interview/try">
          Back to setup
        </a>
      </Shell>
    );
  }

  if (phase === "done") {
    return (
      <Shell>
        <Brand />
        <h1 className="font-display mt-8 text-4xl">Interview complete</h1>
        <p className="mt-3 text-[var(--muted)]">Thanks for speaking with {interviewer}.</p>
      </Shell>
    );
  }

  const statusLabel =
    agentState === "speaking"
      ? `${interviewer} is speaking`
      : agentState === "thinking"
        ? `${interviewer} is thinking…`
        : agentState === "listening"
          ? "Your turn — mic is listening"
          : "Paused";

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Brand />
        <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
          <span
            className="rounded-full px-3 py-1 text-[var(--ink)]"
            style={{
              background:
                agentState === "listening"
                  ? "color-mix(in oklab, var(--accent-2) 30%, transparent)"
                  : agentState === "speaking"
                    ? "color-mix(in oklab, var(--accent) 30%, transparent)"
                    : "var(--panel)",
            }}
          >
            {statusLabel}
          </span>
          <span className="font-display text-xl text-[var(--ink)]">{timer}</span>
        </div>
      </div>

      <div className="mx-auto mt-8 grid w-full max-w-3xl gap-4">
        <p className="text-center text-sm uppercase tracking-[0.2em] text-[var(--muted)]">
          {interviewer} · {info?.role || "Technical interview"}
          {info?.candidate_name ? ` · ${info.candidate_name}` : ""}
        </p>

        <div className="flex flex-col items-center gap-4">
          <VoiceOrb
            agentState={agentState}
            interviewer={interviewer}
            micLevel={micLevel}
            listening={agentState === "listening"}
          />
          <VoiceMeter active={agentState === "listening" || micReady} level={micLevel} audible={micLevel > 0.08} />
          <p className="text-sm text-[var(--muted)]">
            {agentState === "listening"
              ? micLevel > 0.08
                ? "Voice audible ✓"
                : "Listening… speak louder if bars stay flat"
              : agentState === "speaking"
                ? `${interviewer} is talking`
                : statusLabel}
          </p>
        </div>

        {/* Always-visible AI caption */}
        <section className="panel border border-[var(--line)] p-5 text-left">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
            {agentState === "speaking" ? `${interviewer} is saying` : `${interviewer} said / asked`}
          </p>
          <p className="mt-3 text-lg leading-relaxed text-[var(--ink)] sm:text-xl">
            {question ||
              (agentState === "thinking"
                ? `${interviewer} is preparing the next question…`
                : "Waiting for greeting…")}
          </p>
          {agentState === "thinking" && (
            <p className="mt-3 text-sm text-[var(--accent)]">{interviewer} is thinking — please wait…</p>
          )}
        </section>

        {/* Always-visible mic / your voice panel */}
        <section
          className="panel border p-5 text-left"
          style={{
            borderColor:
              agentState === "listening"
                ? "color-mix(in oklab, var(--accent-2) 55%, var(--line))"
                : "var(--line)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Your mic</p>
            <p
              className={`text-sm ${
                micLevel > 0.08 || partialHeard ? "text-[var(--ok)]" : "text-[var(--muted)]"
              }`}
            >
              {micHint}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div
              className={`grid h-14 w-14 shrink-0 place-items-center rounded-full border ${
                agentState === "listening" ? "mic-pulse" : ""
              }`}
              style={{
                background:
                  micLevel > 0.08
                    ? "color-mix(in oklab, var(--ok) 40%, transparent)"
                    : agentState === "listening"
                      ? "color-mix(in oklab, var(--accent-2) 25%, transparent)"
                      : "var(--panel)",
                borderColor: micLevel > 0.08 ? "var(--ok)" : "var(--line)",
                transform: `scale(${1 + Math.min(0.35, micLevel * 0.5)})`,
                transition: "transform 80ms linear",
              }}
              aria-label="Microphone activity"
            >
              <MicIcon hot={micLevel > 0.08} />
            </div>
            <div className="min-w-0 flex-1">
              <VoiceMeter active={agentState === "listening"} level={micLevel} audible={micLevel > 0.08} />
              <p className="mt-3 min-h-[2.5rem] text-base leading-relaxed text-[var(--ink)]">
                {agentState === "thinking" && lastAnswer
                  ? `You said: “${lastAnswer}”`
                  : partialHeard
                    ? `Hearing: “${partialHeard}”`
                    : agentState === "listening"
                      ? "Speak now — bars jump when your voice is audible."
                      : agentState === "speaking"
                        ? `${interviewer} is talking. Your mic opens when they finish.`
                        : lastAnswer
                          ? `Last answer: “${lastAnswer}”`
                          : "Mic idle."}
              </p>
            </div>
          </div>
          {agentState === "listening" && !partialHeard && micLevel < 0.05 && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Bars flat? Check browser mic permission — mic turns on automatically after each question.
            </p>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button className="btn btn-secondary" onClick={endInterview}>
            End interview
          </button>
        </div>

        <p className="text-center text-sm text-[var(--muted)]">
          After you finish answering, pause ~2 seconds and {interviewer} continues. Say “please repeat” anytime.
        </p>

        {/* Live running transcript — always on so screen never feels blank */}
        <section className="panel max-h-56 overflow-y-auto border border-[var(--line)] p-4 text-left text-sm">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Live transcript</p>
          {transcript.length === 0 ? (
            <p className="text-[var(--muted)]">Conversation will show here…</p>
          ) : (
            <div className="space-y-3">
              {transcript.slice(-8).map((t, i) => (
                <p key={`${i}-${t.content.slice(0, 24)}`} className={t.role === "interviewer" ? "" : "text-[var(--muted)]"}>
                  <strong className="text-[var(--ink)]">{t.role === "interviewer" ? interviewer : "You"}:</strong>{" "}
                  {t.content}
                </p>
              ))}
            </div>
          )}
        </section>

        <button className="text-sm text-[var(--muted)] underline" onClick={() => setShowText((v) => !v)}>
          {showText ? "Hide text fallback" : "Need text fallback?"}
        </button>

        {showText && (
          <form
            className="grid w-full gap-3 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              submitAnswer(answer);
              setAnswer("");
            }}
          >
            <textarea
              className="input min-h-24"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer if voice fails…"
            />
            <button className="btn btn-primary w-fit">Send</button>
          </form>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>
    </Shell>
  );
}

function Brand() {
  return <div className="font-display text-lg font-700 tracking-tight">AI Technical Recruiter</div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">{children}</div>;
}

function MicIcon({ hot }: { hot: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        fill={hot ? "#2a9d8f" : "currentColor"}
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke={hot ? "#2a9d8f" : "currentColor"}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function VoiceOrb({
  agentState,
  interviewer,
  micLevel,
  listening,
}: {
  agentState: string;
  interviewer: string;
  micLevel: number;
  listening: boolean;
}) {
  const scale =
    agentState === "listening" ? 1 + Math.min(0.4, micLevel * 0.7) : agentState === "speaking" ? 1.06 : 1;
  return (
    <div
      className={`relative grid h-36 w-36 place-items-center rounded-full border border-[var(--line)] ${
        agentState === "speaking" || listening ? "mic-pulse" : ""
      }`}
      style={{
        background:
          agentState === "speaking"
            ? "color-mix(in oklab, var(--accent) 35%, transparent)"
            : listening
              ? "color-mix(in oklab, var(--accent-2) 28%, transparent)"
              : "var(--panel)",
        transform: `scale(${scale})`,
        transition: "transform 90ms linear, background 200ms ease",
      }}
    >
      <span className="font-display text-3xl">{interviewer[0]}</span>
    </div>
  );
}

function VoiceMeter({
  active,
  level,
  audible,
}: {
  active: boolean;
  level: number;
  audible: boolean;
}) {
  const bars = 16;
  return (
    <div className="voice-meter" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        const wave = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.7 + level * 8));
        const h = active ? Math.max(4, 6 + level * 34 * wave) : 5;
        return (
          <span
            key={i}
            className="voice-bar"
            style={{
              height: `${h}px`,
              background: audible
                ? "var(--ok)"
                : active
                  ? "color-mix(in oklab, var(--accent-2) 70%, var(--muted))"
                  : "var(--line)",
            }}
          />
        );
      })}
    </div>
  );
}
