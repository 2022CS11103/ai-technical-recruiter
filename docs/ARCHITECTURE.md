# ZARA — System Architecture & Build Status

Production-oriented AI Technical Recruiter. Deterministic application logic owns
interview state; LLMs reason where reasoning is required. Free-tier providers:
**Groq** (LLM + Whisper STT) and **Gemini** (LLM via OpenAI-compatible API).
TTS: Edge TTS / browser Web Speech.

---

## 1. System architecture

```
Recruiter / Candidate (Next.js)
        │
        ▼
FastAPI API  ── JWT auth · company tenancy · rate limits
        │
        ├── JD Analyzer ──────── parsing.analyze_jd
        ├── Resume Analyzer ──── parsing.parse_resume
        ├── Match Engine ─────── parsing.match_resume_jd
        ├── Interview Planner ── planner.build_interview_plan
        ├── Conversation Mgr ─── state machine + probe ladder + heuristics
        ├── Evaluator ────────── evidence scores (heuristic-first, LLM optional)
        ├── Report Generator ─── finish → InterviewReport + dossier
        ├── Voice ────────────── STT (Groq Whisper) · TTS (Edge / browser)
        └── RAG (optional) ───── local embeddings over JD/resume chunks
```

Voice path (current production UI): mic → VAD/silence → STT (HTTP) → `/answer`
→ ConversationManager → browser TTS. WebSocket barge-in path exists but is
**PARTIAL** (API yes, UI wiring limited).

---

## 2. Folder structure

```
apps/web/          Next.js — landing, auth, dashboard, interview room, portal, admin
apps/api/          FastAPI — auth, jobs, documents, interviews, platform
services/ai/       JD/resume/match/planner/conversation/evaluator
services/voice/    STT/TTS providers
services/rag/      Embeddings + chunking
infrastructure/    Docker Compose
tests/             Unit + e2e smoke
docs/              Architecture, ops, eval notes
```

---

## 3. Database schema (core entities)

`Company`, `User`, `Job`, `JobProfile`, `Candidate`, `CandidateProfile`,
`ResumeJdMatch`, `InterviewSession`, `InterviewStateRow`, `InterviewQuestion`,
`Answer`, `AnswerEvaluation`, `CompetencyScore`, `InterviewReport`,
`DocumentChunk`, `AuditLog`, credits/wallet (platform).

Dev: SQLite via `create_all`. Prod target: PostgreSQL + pgvector.

---

## 4. API contract (user-facing)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/auth/register` | no | Signup recruiter/candidate |
| POST | `/api/v1/auth/login` | no | JWT |
| POST | `/api/v1/jobs` | recruiter | Create JD + analyze |
| POST | `/api/v1/jobs/{id}/candidates` | recruiter | Attach resume → interview link |
| POST | `/api/v1/interview-links/self-serve` | no | Candidate paste JD+resume |
| POST | `/api/v1/interview-links/{token}/start` | no | Greeting + plan |
| POST | `/api/v1/interview-links/{token}/answer` | no | Turn |
| POST | `/api/v1/interview-links/{token}/stt` | no | Whisper STT |
| POST | `/api/v1/interview-links/{token}/finish` | no | Report |
| GET | `/api/v1/dossiers/recent` | recruiter | Tenant-scoped results |
| GET | `/api/v1/dossiers/{candidate_id}` | recruiter | Evidence dossier |

---

## 5. Interview state machine

```
INTRODUCTION → RESUME/CLAIM PROBE → TECHNICAL DEEPEN → MOVE_TOPIC → …
                                                          ↓
                                                        END → REPORT
```

Actions (code-owned): `FOLLOW_UP`, `CLARIFY`, `CLARIFY_SCOPE`, `MOVE_TOPIC`,
`AWAIT_ANSWER`, `DONT_KNOW`→move, `REPEAT`, `WAIT`, `END`.

LLM is optional polish; hot path uses claim ladder + heuristics for latency.

---

## 6–8. Prompts / tools / voice

- Prompt registry: `services/ai/ai_recruiter/prompts/registry.py` (versioned names)
- Tools: resume/JD/state loaded into context; validated schemas via Pydantic
- Voice: Groq Whisper STT · Edge/browser TTS · interrupt API **PARTIAL**

---

## 9. Deployment

`infrastructure/docker-compose.yml` + Dockerfiles. Local: API `:8001`, web `:3000`
(Next rewrite proxy). Health: `/health`, `/api/v1/ai/status`.

---

## 10. Evaluation strategy

Pytest + MockLLM for core turns (`tests/ai`, `tests/e2e`). Simulated candidate
JSONL harness: **TODO**. Latency/cost traces: **PARTIAL**.

---

## Phase status

| # | Phase | Status |
|---|--------|--------|
| 1 | Auth + DB | **IMPLEMENTED** |
| 2 | JD parser | **IMPLEMENTED** |
| 3 | Resume parser | **IMPLEMENTED** |
| 4 | Matching | **IMPLEMENTED** |
| 5 | Interview planner | **IMPLEMENTED** |
| 6 | State machine | **PARTIAL** (ConversationManager; LangGraph unused at runtime) |
| 7 | Question + follow-up | **IMPLEMENTED** |
| 8 | Answer evaluator | **IMPLEMENTED** |
| 9 | Transcript + evidence | **PARTIAL** |
| 10 | Post-interview report | **IMPLEMENTED** |
| 11 | Candidate web UI | **IMPLEMENTED** |
| 12 | Real-time voice | **PARTIAL** (HTTP turns, not full duplex WS) |
| 13 | Barge-in | **PARTIAL** |
| 14 | Recruiter dashboard | **PARTIAL** (live jobs/results; some mock pages) |
| 15 | Observability | **PARTIAL** |
| 16 | Evaluation harness | **TODO** |
| 17 | Production deploy | **PARTIAL** |
| 18 | Load testing | **TODO** |

### User flows

| Flow | Status |
|------|--------|
| Landing → signup/login | **IMPLEMENTED** |
| Recruiter: job → candidate → link → voice → dossier | **IMPLEMENTED** (hardening in progress) |
| Candidate self-serve `/interview/try` | **IMPLEMENTED** |
| Portal / admin / billing UI | **IMPLEMENTED** / billing charge **PARTIAL** |

---

## Free API keys

```env
# Groq (LLM + Whisper STT) — https://console.groq.com/keys
LLM_PROVIDER=groq
LLM_API_KEY=gsk_...
STT_PROVIDER=groq

# OR Gemini (LLM) — https://aistudio.google.com/apikey
LLM_PROVIDER=gemini
LLM_API_KEY=...          # or GEMINI_API_KEY=
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_MODEL=gemini-2.0-flash
```

TTS stays free via Edge / browser — no ElevenLabs required for MVP.
