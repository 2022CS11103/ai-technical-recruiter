"""Ingest JD/resume/knowledge into chunks and retrieve with fingerprint dedup."""
from __future__ import annotations

import uuid
from typing import Any, Optional

from rag_service import chunk_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document, DocumentChunk
from app.services.ai_factory import get_embedder

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
RETRIEVE_K = 4


def _fingerprint(text: str) -> str:
    return " ".join((text or "").strip().lower().split())[:150]


def dedupe_hits(hits: list[dict[str, Any]], limit: int = RETRIEVE_K) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for hit in hits:
        key = _fingerprint(str(hit.get("content") or ""))
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(hit)
        if len(out) >= limit:
            break
    return out


async def index_text(
    db: AsyncSession,
    *,
    company_id: uuid.UUID,
    text: str,
    document_type: str,
    filename: str,
    job_id: Optional[uuid.UUID] = None,
    candidate_id: Optional[uuid.UUID] = None,
    competency: str = "",
) -> int:
    cleaned = (text or "").strip()
    if len(cleaned) < 40:
        return 0
    doc = Document(
        company_id=company_id,
        job_id=job_id,
        candidate_id=candidate_id,
        document_type=document_type,
        filename=filename,
        extracted_text=cleaned[:20000],
        size_bytes=len(cleaned.encode("utf-8")),
    )
    db.add(doc)
    await db.flush()
    chunks = chunk_text(cleaned, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP)
    if not chunks:
        return 0
    vectors = await get_embedder().embed(chunks)
    for i, (chunk, vec) in enumerate(zip(chunks, vectors)):
        db.add(
            DocumentChunk(
                document_id=doc.id,
                company_id=company_id,
                job_id=job_id,
                document_type=document_type,
                competency=competency,
                section=f"chunk-{i}",
                source=filename,
                chunk_index=i,
                content=chunk,
                embedding=vec,
            )
        )
    return len(chunks)


async def index_interview_corpus(
    db: AsyncSession,
    *,
    company_id: uuid.UUID,
    job_id: uuid.UUID,
    candidate_id: uuid.UUID,
    jd_text: str,
    resume_text: str,
) -> dict[str, int]:
    jd_n = await index_text(
        db,
        company_id=company_id,
        text=jd_text,
        document_type="jd",
        filename="job_description.txt",
        job_id=job_id,
    )
    resume_n = await index_text(
        db,
        company_id=company_id,
        text=resume_text,
        document_type="resume",
        filename="resume.txt",
        job_id=job_id,
        candidate_id=candidate_id,
    )
    return {"jd_chunks": jd_n, "resume_chunks": resume_n}
