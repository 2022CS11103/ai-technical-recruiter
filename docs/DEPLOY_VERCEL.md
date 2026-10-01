# Deploy ZARA to Vercel (web) + Render/Railway (API)

ZARA has **two apps**. Vercel hosts the Next.js UI only. The FastAPI voice/interview
backend must run on a long-lived host (Render free tier, Railway, Fly.io, etc.).

```
Browser  →  Vercel (apps/web)  →  rewrites /api/*  →  FastAPI (Render/Railway)
```

---

## 1. Deploy the API first (Render example)

1. Go to [https://render.com](https://render.com) → **New → Web Service**
2. Connect GitHub repo `ai-technical-recruiter`
3. Settings:
   - **Root Directory:** leave empty (repo root)
   - **Runtime:** Docker
   - **Dockerfile path:** `infrastructure/Dockerfile.api`
   - **Instance:** Free
4. Environment variables (Render dashboard):

| Key | Value |
|-----|--------|
| `APP_ENV` | `production` |
| `JWT_SECRET` | long random string (32+ chars) |
| `LLM_PROVIDER` | `groq` or `gemini` |
| `LLM_API_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY` | your key |
| `STT_PROVIDER` | `groq` |
| `STT_API_KEY` | Groq key (needed for Whisper) |
| `TTS_PROVIDER` | `edge` |
| `DATABASE_URL` | `sqlite+aiosqlite:///./ai_recruiter.db` (demo) or Postgres URL |
| `CORS_ORIGINS` | `https://YOUR-VERCEL-APP.vercel.app` |
| `PUBLIC_API_URL` | `https://YOUR-API.onrender.com` |

5. Deploy → copy the public URL, e.g. `https://zara-api.onrender.com`

Health check: `https://YOUR-API.onrender.com/health`

> Free Render spins down after idle; first request can take ~30–60s.

---

## 2. Deploy the web app on Vercel

1. Go to [https://vercel.com/new](https://vercel.com/new)
2. Import the same GitHub repo
3. Configure project:
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web`  ← important
   - **Build Command:** `npm run build` (default)
   - **Install Command:** `npm install` (default)
4. Environment variables:

| Key | Value |
|-----|--------|
| `API_PROXY_TARGET` | `https://YOUR-API.onrender.com` (no trailing slash) |
| `NEXT_PUBLIC_API_URL` | leave empty for same-origin `/api` proxy, **or** set to the API URL |

5. Deploy

6. After first deploy, update Render `CORS_ORIGINS` to your real Vercel URL
   (and any preview URLs you need), then redeploy API if needed.

---

## 3. Vercel CLI (optional)

```bash
cd apps/web
npx vercel login
npx vercel --prod
```

When prompted, set Root Directory to `apps/web` and add `API_PROXY_TARGET`.

---

## 4. Smoke test after deploy

1. Open `https://YOUR-APP.vercel.app`
2. `/interview/try` → paste JD + resume → start
3. If “Cannot reach API”: check `API_PROXY_TARGET` and Render service status
4. Login demo: seed users only exist if you ran `python -m app.scripts.seed` on the API host

---

## 5. Notes

- **Do not** put Groq/Gemini keys in Vercel unless you also call LLMs from Next
  (today all LLM/STT calls go through FastAPI).
- Interview turns can take 10–60s; keep API on a non-serverless host.
- SQLite on Render free disk is ephemeral — use Postgres for anything you want to keep.
- Local `.env` keys stay local; never commit real keys.
