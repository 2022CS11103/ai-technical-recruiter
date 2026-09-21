"""Factory for LLM / embedding / voice / agent wired from settings."""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai_recruiter import ConversationManager, InterviewAgent, build_llm
from rag_service import build_embedding_provider
from voice_service import build_stt, build_tts

from app.core.config import get_settings
from app.models import DocumentChunk


@lru_cache
def get_llm():
    s = get_settings()
    return build_llm(s.llm_provider if s.llm_api_key else "mock", s.llm_api_key, s.llm_base_url, s.llm_model, s.llm_fallback_model)


@lru_cache
def get_embedder():
    s = get_settings()
    return build_embedding_provider(
        s.embedding_provider,
        s.embedding_api_key or s.llm_api_key,
        s.embedding_model,
        s.embedding_dim,
        s.llm_base_url,
    )


@lru_cache
def get_stt():
    s = get_settings()
    key = s.stt_api_key or s.llm_api_key
    return build_stt(s.stt_provider if key else "mock", key, s.stt_model)


@lru_cache
def get_tts():
    s = get_settings()
    return build_tts(s.tts_provider, s.tts_voice)


INTERVIEWER_VOICES = {
    "sarah": "en-US-JennyNeural",
    "rahul": "en-US-GuyNeural",
}


def get_tts_for_interviewer(name: str | None = None):
    s = get_settings()
    key = (name or "sarah").strip().lower()
    voice = INTERVIEWER_VOICES.get(key, s.tts_voice)
    return build_tts(s.tts_provider, voice)


def make_agent(db: Optional[AsyncSession] = None) -> InterviewAgent:
    async def rag_retrieve(
        query: str,
        company_id: str = "",
        job_id: str = "",
        competency: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        if db is None or not company_id:
            return []
        embedder = get_embedder()
        qvec = (await embedder.embed([query]))[0]
        stmt = select(DocumentChunk).where(DocumentChunk.company_id == UUID(company_id))
        if job_id:
            stmt = stmt.where(
                (DocumentChunk.job_id == UUID(job_id)) | (DocumentChunk.job_id.is_(None))
            )
        if competency:
            stmt = stmt.where(
                (DocumentChunk.competency == competency) | (DocumentChunk.competency == "")
            )
        stmt = stmt.limit(50)
        rows = (await db.execute(stmt)).scalars().all()
        scored = []
        for row in rows:
            if row.embedding is None:
                continue
            score = sum(float(a) * float(b) for a, b in zip(qvec, row.embedding))
            scored.append((score, row))
        scored.sort(key=lambda x: x[0], reverse=True)
        hits = [
            {
                "content": r.content,
                "score": s,
                "document_type": r.document_type,
                "competency": r.competency,
                "source": r.source,
            }
            for s, r in scored[:12]
            if s > 0.05
        ]
        seen: set[str] = set()
        deduped = []
        for hit in hits:
            key = " ".join(str(hit.get("content") or "").lower().split())[:150]
            if key in seen:
                continue
            seen.add(key)
            deduped.append(hit)
            if len(deduped) >= 4:
                break
        return deduped

    manager = ConversationManager(get_llm(), rag_retrieve=rag_retrieve)
    return InterviewAgent(manager)
