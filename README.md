# AI Technical Recruiter

Adaptive, voice-based technical interviewing SaaS: resume + JD + company knowledge → LangGraph interview agent → evidence-based reports.

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js, React, TypeScript, Tailwind |
| Backend | FastAPI, Pydantic, SQLAlchemy async |
| DB | PostgreSQL + pgvector |
| Cache | Redis |
| AI | LangGraph, provider-abstracted LLM/embeddings |
| Voice | STT/TTS abstractions (Groq Whisper + Edge TTS) |

## Quick start (local, no Docker)

Docker is optional. This machine can run with **SQLite** + optional Redis.

### API (port 8001 if 8000 is busy)

```bash
cd apps/api
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
pip install -e ../../services/ai -e ../../services/rag -e ../../services/voice
copy ..\..\.env.example .env
python -m app.scripts.seed
uvicorn app.main:app --reload --port 8001
```

### Web

```bash
cd apps/web
echo NEXT_PUBLIC_API_URL=http://127.0.0.1:8001> .env.local
npm install
npm run dev
```

- Web: http://localhost:3000  
- API docs: http://127.0.0.1:8001/docs  
- Demo login: `recruiter@example.com` / `demo1234`  
- Candidate demo UI (no backend): http://localhost:3000/interview/demo  


## Local development

### 1. Infrastructure

```bash
docker compose -f infrastructure/docker-compose.yml up -d db redis
```

### 2. API

```bash
cd apps/api
python -m venv .venv
.\.venv\Scripts\activate   # Windows
pip install -r requirements.txt
pip install -e ../../services/ai -e ../../services/rag -e ../../services/voice
cp ../../.env.example .env
alembic upgrade head
python -m app.scripts.seed
uvicorn app.main:app --reload --port 8000
```

### 3. Web

```bash
cd apps/web
npm install
npm run dev
```

### 4. Tests

```bash
cd apps/api
pytest ../../tests -q
```

## Environment

Copy `.env.example` → `apps/api/.env`. Never commit secrets. Without LLM/STT keys, local mock providers still allow end-to-end flows (text interview + deterministic parsing heuristics).

## Sample data

`sample_data/` includes a fictional AI Engineer JD and candidate resume for immediate testing.
