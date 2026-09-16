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
    body: "Natural turn-taking with STT/TTS, barge-in, repeat, and text fallback.",
  },
  {
    title: "Company-specific RAG",
    body: "Retrieve verified handbook and question-bank context—never invent policy.",
  },
  {
    title: "Evidence-based evaluation",
    body: "Separate generation from scoring. Scores require evidence or stay insufficient.",
  },
  {
    title: "Detailed recruiter reports",
    body: "Competency breakdowns, claim validation, transcripts, and human override.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="font-display text-lg font-700 tracking-tight">AI Technical Recruiter</div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[var(--muted)] hover:text-[var(--ink)]">
            Sign in
          </Link>
          <Link href="/register" className="btn btn-primary text-sm">
            Create Interview
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid min-h-[78vh] max-w-6xl items-center gap-10 px-6 pb-16 pt-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="font-display text-5xl leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            AI Technical Recruiter
          </p>
          <h1 className="mt-5 max-w-xl text-xl text-[var(--muted)] sm:text-2xl">
            Conduct adaptive technical interviews with AI.
          </h1>
          <p className="mt-4 max-w-lg text-[var(--muted)]">
            Resume + JD + company knowledge drive a stateful interview agent that asks better
            follow-ups and returns evidence recruiters can trust.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-primary">
              Create Interview
            </Link>
            <Link href="/interview/try" className="btn btn-secondary">
              Try Candidate Interview
            </Link>
          </div>
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
                “You mentioned building CreatorOS. Walk me through its retrieval pipeline.”
              </p>
              <div className="mt-8 flex items-end gap-2 h-16">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-[var(--accent)]"
                    style={{
                      height: `${20 + ((i * 37) % 50)}%`,
                      opacity: 0.45 + ((i % 5) * 0.1),
                      animation: `pulse-ring ${1.2 + (i % 4) * 0.15}s ease-in-out infinite`,
                      animationDelay: `${i * 40}ms`,
                    }}
                  />
                ))}
              </div>
              <p className="mt-6 text-sm text-[var(--muted)]">
                Next action · FOLLOW_UP · missing: reranking, retrieval evaluation
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="font-display text-3xl tracking-tight">Built for serious technical hiring</h2>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          One composition of signals: resume claims, JD competencies, company RAG, conversation
          state, and rubric-backed evaluation.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article key={f.title} className="panel p-5">
              <h3 className="font-display text-xl">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{f.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
