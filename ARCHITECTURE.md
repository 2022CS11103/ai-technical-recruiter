# AI Technical Recruiter — System Architecture

Production-oriented SaaS for adaptive, voice-based technical interviews grounded in resume, JD, company knowledge, and evidence-based evaluation.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         apps/web (Next.js)                              │
│  Landing · Auth · Recruiter Dashboard · Candidate Interview UI · Reports│
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ REST + WebSocket
┌───────────────────────────────▼─────────────────────────────────────────┐
│                         apps/api (FastAPI)                              │
│  Auth · Jobs · Documents · Interviews · Knowledge · Reports · Health    │
└───────┬─────────────────┬─────────────────┬─────────────────────────────┘
        │                 │                 │
┌───────▼──────┐  ┌───────▼──────┐  ┌───────▼──────────────────────────────┐
│ services/ai  │  │ services/rag │  │ services/voice                       │
│ LangGraph    │  │ Embeddings   │  │ STT · TTS · Transport · Turn-taking  │
│ Planner      │  │ Chunking     │  │                                      │
│ Evaluator    │  │ Hybrid+Rerank│  │                                      │
│ Guardrails   │  │ pgvector     │  │                                      │
└───────┬──────┘  └───────┬──────┘  └───────┬──────────────────────────────┘
        │                 │                 │
┌───────▼─────────────────▼─────────────────▼──────────────────────────────┐
│  PostgreSQL + pgvector          Redis (session/cache)   Object storage   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Monorepo layout**

```
ai-technical-recruiter/
├── apps/web                 # Next.js frontend
├── apps/api                 # FastAPI gateway + domain APIs
├── packages/shared          # Shared types / OpenAPI-derived contracts
├── services/ai              # Interview agent, planners, evaluators, prompts
├── services/rag             # Ingestion, retrieval, reranking
├── services/voice           # STT/TTS/transport abstractions
├── infrastructure           # docker-compose, Dockerfiles
├── docs                     # Product & ops docs
├── tests                    # Cross-cutting & e2e tests
├── sample_data              # Fictional JD + resume
├── ARCHITECTURE.md
├── IMPLEMENTATION_PLAN.md
└── README.md
```

---

## 2. Frontend Architecture

| Area | Approach |
|------|----------|
| Framework | Next.js (App Router) + React + TypeScript + Tailwind |
| Auth | Cookie/JWT session; protected layout for `/dashboard/**` |
| Recruiter UI | Sidebar shell: Overview, Jobs, Candidates, Interviews, Reports, Question Bank, Knowledge Base, Settings |
| Candidate UI | Minimal `/interview/[token]` — consent, mic test, voice session, controls |
| Data fetching | Typed API client against FastAPI OpenAPI |
| Real-time | WebSocket for interview turns (audio frames + events) |
| State | Server components where possible; client for voice/mic |

**Key routes**

- `/` landing
- `/login`, `/register`
- `/dashboard`, `/jobs`, `/jobs/new`, `/jobs/[id]`
- `/candidates`, `/candidates/[id]`
- `/interviews`, `/interviews/[id]`
- `/interview/[secure-token]`
- `/reports/[id]`, `/knowledge`, `/settings`

---

## 3. Backend Architecture

FastAPI app (`apps/api`) owns HTTP/WebSocket surface. Domain logic lives in services; API layer is thin.

**Layers**

1. **API routers** — auth, jobs, documents, resumes, interviews, knowledge, questions, research, health
2. **Domain services** — matching, interview lifecycle, reports, audit
3. **AI / RAG / Voice packages** — provider-abstracted, injectable
4. **Persistence** — SQLAlchemy async + Alembic; Redis for hot interview state
5. **Workers** (optional Celery/RQ later) — heavy OCR/embedding jobs; sync path for MVP with background tasks

**Principles**

- Business logic outside prompts
- Structured Pydantic I/O everywhere
- Tenant isolation on every query (`company_id`)
- Separate generation vs evaluation vs recommendation

---

## 4. Database Schema (PostgreSQL + pgvector)

Core entities (UUID PKs, `created_at` / `updated_at`, FKs + indexes):

| Table | Purpose |
|-------|---------|
| `users` | Auth identity, role (`recruiter` / `candidate` / `admin`) |
| `companies` | Tenant |
| `company_memberships` | User ↔ company |
| `jobs` | Role + JD text + config |
| `job_profiles` | Structured JD extraction |
| `candidates` | Candidate records |
| `candidate_profiles` | Structured resume extraction |
| `documents` | Uploaded files metadata |
| `document_chunks` | Chunks + `embedding vector` + metadata |
| `resume_jd_matches` | Match engine output |
| `competencies` | Named competencies + weights per job |
| `mandatory_questions` / `question_bank` | Company/job questions |
| `company_knowledge` | Knowledge doc registry |
| `interview_sessions` | Session + secure token hash |
| `interview_states` | Persistent agent state JSON |
| `questions` / `answers` / `answer_evaluations` | Turn-level artifacts |
| `competency_scores` | Aggregated scores |
| `interview_reports` | Final report + recommendation |
| `audit_logs` | Security/compliance events |
| `research_sources` | Grounded web research cache |
| `prompt_versions` | Prompt registry |
| `llm_traces` | Observability summaries |

**pgvector**: HNSW/IVFFlat index on `document_chunks.embedding` filtered by `company_id`, `job_id`, `document_type`, `competency`.

---

## 5. AI Architecture

Provider abstractions:

- `LLMProvider` — `generate`, `structured_output`
- `EmbeddingProvider`
- `RerankerProvider`
- `ResearchProvider`

Primary implementation: **OpenAI-compatible / Groq** for LLM + embeddings (dev mock when keys absent).

**Prompt modules** (versioned, separate files):

- `resume_parser`, `jd_analyzer`, `candidate_jd_matcher`
- `interview_planner`, `question_generator`, `answer_evaluator`
- `next_action_decider`, `report_generator`
- `candidate_question_handler`, `guardrail_checker`

Cost controls: token/context limits, summarization, caching, model routing, retries + exponential backoff. Never send full transcript + resume + JD on every call — use structured state + retrieved slices.

---

## 6. RAG Architecture

```
File → extract → clean → chunk → metadata → embed → pgvector
Query → preprocess → metadata filter → vector (+ optional BM25) → rerank → select → LLM
```

**Used for**: company Q&A, mandatory/approved questions, policies, role docs, recruiter instructions.

**Not used for**: inventing company facts. Missing → *"I don't have verified information about that."*

Metadata filters always include `company_id` (+ `job_id` / `competency` when known).

---

## 7. Voice Architecture

```
Mic → WebSocket audio → STT → Interview Agent → TTS → Speaker
```

Abstractions: `STTProvider`, `TTSProvider`, `RealtimeTransport`.

MVP providers: Groq Whisper (STT), Edge TTS (TTS), WebSocket transport. Browser MediaRecorder / PCM streaming with VAD, barge-in, silence detection, reconnect, text fallback.

---

## 8. LangGraph / State-Machine Architecture

```
START → LOAD_CONTEXT → VALIDATE_CONTEXT → INTRODUCTION
  → SELECT_COMPETENCY → GENERATE_QUESTION → GUARDRAIL_CHECK → ASK_QUESTION
  → LISTEN → TRANSCRIBE → CLASSIFY_RESPONSE → ANALYZE_ANSWER → UPDATE_STATE
  → DECIDE_NEXT_ACTION
       ├ FOLLOW_UP / CLARIFY / ↑↓ DIFFICULTY / MOVE_TOPIC
       ├ ASK_MANDATORY / REVISIT_REQUIREMENT
       └ END → FINAL_EVALUATION → REPORT_GENERATION → END
```

**ConversationManager** owns: `start`, `process_answer`, `handle_interrupt`, `repeat_question`, `clarify`, `pause`, `resume`, `handle_candidate_question`, `transition`, `finish`.

Persistent `InterviewState` in Postgres; Redis mirror for active sessions.

---

## 9. API Architecture

REST under `/api/v1` + WebSocket `/api/v1/ws/interviews/{id}`.

Auth: `POST /auth/register`, `POST /auth/login`  
Jobs, documents, resumes, interviews (start/answer/interrupt/repeat/pause/resume/finish), knowledge, questions, research, reports, health (`/health`, `/ready`).

All recruiter routes: JWT + company-scoped authorization. Candidate routes: high-entropy secure token (not sequential IDs).

---

## 10. Security Model

- Password hashing (bcrypt) + JWT sessions
- Role-based access; tenant isolation
- Secure interview tokens (hashed at rest)
- Upload validation: size, MIME, extension allowlist
- Rate limiting; secrets via `.env` only
- Signed/local file storage; audit logs
- No cross-tenant resume/transcript leakage
- AI never makes irreversible hire decisions — human override required

**Privacy**: consent capture, retention policy hooks, deletion/export, AI/recording disclosure, no training on candidate data by default.

---

## 11. Deployment Architecture

```
docker-compose:
  web (Next.js) → api (FastAPI) → postgres(pgvector) + redis
```

Health/readiness probes, structured logging, connection pooling, Alembic migrations, graceful shutdown. Observability: LangSmith-compatible traces + local `llm_traces` table; evaluation datasets for relevance, follow-ups, scoring, RAG, hallucination, guardrails.

---

## 12. Future Modules (non-blocking)

Candidate Agent, Recruiter Copilot, sourcing, scheduling, ATS adapters, coding/system-design rooms, multilingual interviews — enabled by provider interfaces and agent package boundaries.
