# AI Technical Recruiter — Implementation Plan

Work incrementally. Each phase: implement → test → fix → verify → next.

Legend: `[ ]` pending · `[~]` in progress · `[x]` done

---

## PHASE 1 — Repository inspection & foundation
- [x] Inspect Downloads workspace / related projects
- [x] Identify reusable patterns (voice-ai-platform: FastAPI, Groq, Edge TTS, pgvector)
- [x] Confirm no existing AI Technical Recruiter app — greenfield monorepo
- [x] Create `ARCHITECTURE.md`
- [x] Create `IMPLEMENTATION_PLAN.md`
- [x] Scaffold monorepo (`apps/`, `services/`, `packages/`, `infrastructure/`, `tests/`, `docs/`)
- [x] Root `README.md`, `.env.example`, `.gitignore`
- [x] Shared Python package layout + dependency files

## PHASE 2 — Authentication, database, roles
- [x] SQLAlchemy models for all core tables
- [x] DB bootstrap (+ pgvector when Postgres available; SQLite local fallback)
- [x] Redis client for session state (optional soft-fail)
- [x] Register / login / JWT / roles (recruiter, candidate, admin)
- [x] Tenant isolation helpers
- [x] Secure interview token generation
- [x] Auth + health API tests

## PHASE 3 — Frontend shell, jobs, uploads
- [x] Next.js app with Tailwind + landing page
- [x] Login / register
- [x] Dashboard layout + sidebar
- [x] Create job (upload/paste JD)
- [x] Document upload API + UI
- [x] Candidate resume upload/paste

## PHASE 4 — Document processing & parsers
- [x] PDF / DOCX / TXT / MD extraction
- [x] OCR fallback path for scanned PDFs
- [x] Resume parser (structured Pydantic)
- [x] JD analyzer (structured Pydantic)
- [x] Editable extracted profiles in UI (JSON review surfaces)
- [x] Parser unit tests + sample data

## PHASE 5 — Resume / JD matching
- [x] Matching engine (strong / partial / missing / claims)
- [x] Persist `resume_jd_matches`
- [x] Dashboard match view
- [x] Matching tests

## PHASE 6 — Interview configuration & question bank
- [x] Duration, difficulty, style, competency weights (=100%)
- [x] Question bank CRUD
- [x] Competency configuration UI

## PHASE 7 — RAG & knowledge base
- [x] Chunk → embed → store pipeline
- [x] Metadata-filtered retrieval + local embeddings
- [x] Knowledge upload UI
- [x] Safe fallback when no verified context
- [x] RAG retrieval tests (chunk/embed)

## PHASE 8 — Interview planner
- [x] Plan generation (sections, budget, mandatory, claims)
- [x] Persist plan on session
- [x] Planner covered via agent/e2e tests

## PHASE 9 — LangGraph interview agent
- [x] Graph definition + ConversationManager source of truth
- [x] Persistent `InterviewState`
- [x] Redis hot state (best-effort)
- [x] ConversationManager
- [x] State transition / e2e tests

## PHASE 10 — Adaptive follow-ups, evaluation, scoring
- [x] Answer analyzer → next action
- [x] Separate answer evaluator + rubrics (0–5)
- [x] Evidence-first scoring / INSUFFICIENT_EVIDENCE
- [x] Resume claim validation tracking
- [x] Evaluator tests

## PHASE 11 — Text interview path
- [x] Start / answer / finish HTTP APIs
- [x] Candidate text fallback UI
- [x] Transcript persistence
- [x] End-to-end text interview test

## PHASE 12 — Voice (STT / TTS / transport)
- [x] Provider interfaces + Groq STT + Edge TTS (+ mocks)
- [x] WebSocket realtime transport
- [x] Barge-in, silence/mic states, reconnect hooks, text fallback
- [x] Candidate voice UI
- [x] Voice failure → text fallback

## PHASE 13 — Candidate questions, guardrails, research
- [x] Intent classification for candidate utterances
- [x] Guardrail layer (pre/post generation)
- [x] Optional grounded research tool (disabled by default)
- [x] Guardrail + intent tests

## PHASE 14 — Final report & recruiter review
- [x] Report generator
- [x] Optional candidate-facing report payload
- [x] Recruiter override + notes
- [x] Report UI

## PHASE 15 — Observability & evaluation
- [x] Structured logging + local trace model
- [x] LangSmith optional config
- [x] Evaluation dataset stubs in docs

## PHASE 16 — Security & privacy
- [x] Rate limiting, upload limits, MIME checks
- [x] Consent + retention notes
- [x] Audit logging
- [x] Cross-tenant checks on recruiter routes

## PHASE 17 — Testing
- [x] pytest suite (9 passing)
- [x] Frontend pages built for core flows
- [x] Full e2e agent: start → answers → report

## PHASE 18 — Docker & deployment
- [x] Dockerfiles for web + api
- [x] `docker-compose` (web, api, postgres, redis)
- [x] Health / ready endpoints
- [x] README runbook
- [ ] Docker verified on this machine (Docker CLI not installed)

---

## Notes

- Without LLM/STT keys: MockLLM / MockSTT enable full local text demos; Edge TTS used when available.
- Prefer Postgres+pgvector via compose when Docker is available; SQLite is the default local fallback.
