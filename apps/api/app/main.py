from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import text

from app.api import auth, documents, interviews, jobs, knowledge
from app.core.config import get_settings
from app.core.redis_client import close_redis, get_redis
from app.db.session import engine
from app.models import Base

settings = get_settings()
logger = structlog.get_logger()
limiter = Limiter(key_func=get_remote_address, default_limits=[f"{settings.rate_limit_per_minute}/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    # Dev convenience: create tables if migrations not run yet
    if settings.app_env == "development":
        try:
            async with engine.begin() as conn:
                if settings.database_url.startswith("postgresql"):
                    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                await conn.run_sync(Base.metadata.create_all)
        except Exception as exc:
            logger.warning("db_init_failed", error=str(exc))
    yield
    await close_redis()
    await engine.dispose()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    # Dev: allow local frontends; production should set CORS_ORIGINS explicitly
    allow_origins=settings.cors_origin_list if settings.app_env != "development" else [
        *settings.cors_origin_list,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(interviews.router, prefix="/api/v1")
app.include_router(knowledge.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/ready")
async def ready():
    checks = {"database": False, "redis": False}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        checks["database"] = False
    try:
        r = await get_redis()
        await r.ping()
        checks["redis"] = True
    except Exception:
        checks["redis"] = False
    status = "ready" if checks["database"] else "degraded"
    code = 200 if checks["database"] else 503
    return JSONResponse({"status": status, "checks": checks}, status_code=code)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.error("unhandled_error", path=str(request.url), error=str(exc))
    return JSONResponse({"detail": "Internal server error"}, status_code=500)
