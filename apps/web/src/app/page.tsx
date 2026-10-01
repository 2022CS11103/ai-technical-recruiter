import Link from "next/link";

const features = [
  {
    title: "Resume-aware interviews",
    body: "Probe real claims from the CV with dynamic follow-ups—not generic trivia.",
  },
  {
    title: "JD-aware questions",
    body: "Every turn stays anchored to required competencies and role expectations.",
  },
  {
    title: "Voice AI, not a chatbot",
    body: "Natural turn-taking with STT/TTS, silence detection, and text fallback.",
  },
  {
    title: "Evidence-based evaluation",
    body: "Scores require transcript evidence. Insufficient evidence stays labeled clearly.",
  },
  {
    title: "Recruiter dossiers",
    body: "Competency breakdowns, claim validation, highlights, and human override.",
  },
  {
    title: "Works on free API keys",
    body: "Plug in Groq and/or Gemini. Edge/browser TTS keeps voice cost near zero.",
  },
];

const steps = [
  { n: "1", title: "Create workspace", body: "Sign up as a recruiter and add your company." },
  { n: "2", title: "Add a job + JD", body: "Paste the role description. ZARA extracts must-have competencies." },
  { n: "3", title: "Invite a candidate", body: "Upload or paste a resume. Get a shareable interview link." },
  { n: "4", title: "Voice interview", body: "ZARA listens, probes claims, and adapts difficulty in real time." },
  { n: "5", title: "Review evidence", body: "Open the dossier — scores, transcript excerpts, unverified claims." },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="font-mono text-sm font-semibold tracking-[0.28em]">ZARA</div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
            Sign in
          </Link>
          <Link href="/register" className="btn btn-primary text-sm">
            Sign up free
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid min-h-[78vh] max-w-6xl items-center gap-10 px-6 pb-16 pt-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            AI technical recruiter
          </p>
          <p className="font-display mt-3 text-5xl leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            ZARA
          </p>
          <h1 className="mt-5 max-w-xl text-xl text-[var(--muted)] sm:text-2xl">
            Voice-native interviews that verify resume claims with evidence — not vibes.
          </h1>
          <p className="mt-4 max-w-lg text-[var(--muted)]">
            Recruiter workspace for jobs and dossiers. Candidates join a calm voice room.
            Uses free Groq / Gemini keys for LLM reasoning.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-primary">
              Create recruiter account
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Sign in
            </Link>
            <Link href="/interview/try" className="btn btn-secondary">
              Try voice interview
            </Link>
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Demo: recruiter@example.com · candidate@example.com · admin@example.com — password demo1234
          </p>
        </div>

        <div className="relative">
          <div className="panel relative overflow-hidden p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(46,196,182,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(244,162,97,0.14),transparent_40%)]" />
            <div className="relative">
              <div className="flex items-center justify-between text-sm text-[var(--muted)]">
                <span>Live interview · AI Engineer</span>
                <span className="rounded-full bg-[color-mix(in_oklab,var(--accent)_25%,transparent)] px-2 py-1 text-[var(--accent)]">
                  adaptive
                </span>
              </div>
              <p className="font-display mt-6 text-2xl leading-snug">
                “You mentioned building CreatorOS. Why Qdrant over BM25 alone — and how did you evaluate retrieval?”
              </p>
              <div className="mt-8 flex h-16 items-end gap-2">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-[var(--accent)]"
                    style={{
                      height: `${20 + ((i * 37) % 50)}%`,
                      opacity: 0.45 + (i % 5) * 0.1,
                      animation: `pulse-ring ${1.2 + (i % 4) * 0.15}s ease-in-out infinite`,
                      animationDelay: `${i * 40}ms`,
                    }}
                  />
                ))}
              </div>
              <p className="mt-6 text-sm text-[var(--muted)]">
                Claim probe · evidence score · no personality grading
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="font-display text-3xl">End-to-end workflow</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s) => (
            <div key={s.n} className="panel p-4">
              <p className="text-xs font-semibold text-[var(--accent)]">Step {s.n}</p>
              <p className="mt-2 font-medium">{s.title}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="font-display text-3xl">Why teams use ZARA</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="panel p-5">
              <p className="font-medium">{f.title}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
