from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_user_company_id, require_recruiter
from app.db.session import get_db
from app.models import CompanyKnowledge, Document, QuestionBankItem, ResearchSource, User
from app.schemas import QuestionCreate
from app.core.config import get_settings

router = APIRouter(tags=["knowledge"])


@router.post("/questions")
async def create_question(
    body: QuestionCreate,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    item = QuestionBankItem(
        company_id=company_id,
        job_id=body.job_id,
        question=body.question,
        competency=body.competency,
        difficulty=body.difficulty,
        expected_concepts=body.expected_concepts,
        rubric=body.rubric,
        mandatory=body.mandatory,
        time_limit_seconds=body.time_limit_seconds,
        question_type=body.question_type,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"id": str(item.id), **body.model_dump(mode="json")}


@router.get("/questions")
async def list_questions(
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
    job_id: Optional[UUID] = None,
):
    company_id = await get_user_company_id(user, db)
    stmt = select(QuestionBankItem).where(QuestionBankItem.company_id == company_id)
    if job_id:
        stmt = stmt.where(QuestionBankItem.job_id == job_id)
    rows = (await db.execute(stmt.order_by(QuestionBankItem.created_at.desc()))).scalars().all()
    return [
        {
            "id": str(r.id),
            "question": r.question,
            "competency": r.competency,
            "difficulty": r.difficulty,
            "expected_concepts": r.expected_concepts,
            "rubric": r.rubric,
            "mandatory": r.mandatory,
            "time_limit_seconds": r.time_limit_seconds,
            "question_type": r.question_type,
            "job_id": str(r.job_id) if r.job_id else None,
        }
        for r in rows
    ]


@router.post("/knowledge/upload")
async def register_knowledge(
    payload: dict,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Register an already-uploaded document as company knowledge."""
    company_id = await get_user_company_id(user, db)
    doc_id = payload.get("document_id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="document_id required")
    doc = await db.get(Document, UUID(doc_id))
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    row = CompanyKnowledge(
        company_id=company_id,
        job_id=UUID(payload["job_id"]) if payload.get("job_id") else None,
        document_id=doc.id,
        title=payload.get("title") or doc.filename,
        knowledge_type=payload.get("knowledge_type") or "general",
    )
    db.add(row)
    await db.commit()
    return {"id": str(row.id)}


@router.get("/knowledge")
async def list_knowledge(
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    rows = (
        await db.execute(
            select(CompanyKnowledge)
            .where(CompanyKnowledge.company_id == company_id)
            .order_by(CompanyKnowledge.created_at.desc())
        )
    ).scalars().all()
    return [
        {
            "id": str(r.id),
            "title": r.title,
            "knowledge_type": r.knowledge_type,
            "document_id": str(r.document_id) if r.document_id else None,
            "job_id": str(r.job_id) if r.job_id else None,
        }
        for r in rows
    ]


@router.post("/research")
async def research(
    payload: dict,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    settings = get_settings()
    if not settings.research_enabled:
        raise HTTPException(status_code=400, detail="Research tool disabled. Set RESEARCH_ENABLED=true to enable.")
    company_id = await get_user_company_id(user, db)
    query = payload.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query required")
    # Grounded stub — does not fabricate web results without a provider
    result = "No external research provider configured. Enable RESEARCH_PROVIDER to fetch grounded sources."
    source = "none"
    row = ResearchSource(company_id=company_id, query=query, result=result, source=source, meta={"provider": settings.research_provider})
    db.add(row)
    await db.commit()
    return {"query": query, "result": result, "source": source, "timestamp": row.created_at.isoformat() if row.created_at else None}
