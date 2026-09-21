import uuid
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ai_recruiter import match_resume_jd, parse_resume
from ai_recruiter.schemas import JobProfileExtract, ResumeProfile
from rag_service import chunk_text

from app.core.config import get_settings
from app.core.deps import get_user_company_id, require_recruiter
from app.db.session import get_db
from app.models import (
    Candidate,
    CandidateProfile,
    Document,
    DocumentChunk,
    Job,
    JobProfile,
    ResumeJdMatch,
    User,
)
from app.schemas import CandidateCreate, CandidateOut, MatchOut
from app.services.ai_factory import get_embedder, get_llm
from app.services.documents import extract_text, validate_upload

router = APIRouter(tags=["documents"])

_PROFILE_KEYS = {
    "candidate_name",
    "email",
    "phone",
    "summary",
    "skills",
    "experience",
    "education",
    "projects",
    "certifications",
    "achievements",
    "source_evidence",
}
_MATCH_KEYS = {
    "strong_matches",
    "partial_matches",
    "missing",
    "claims_to_validate",
    "relevant_projects",
    "potential_interview_areas",
}


def _profile_row_kwargs(profile: ResumeProfile) -> dict:
    data = profile.model_dump()
    row = {k: data[k] for k in _PROFILE_KEYS if k in data}
    row["raw_extraction"] = data
    if data.get("claims") and not row.get("achievements"):
        row["achievements"] = data["claims"][:10]
    return row


def _match_row_kwargs(match) -> dict:
    data = match.model_dump() if hasattr(match, "model_dump") else dict(match)
    row = {k: data.get(k) or [] for k in _MATCH_KEYS}
    row["raw"] = data
    return row
settings = get_settings()


@router.post("/documents/upload")
async def upload_document(
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    document_type: str = Form("knowledge"),
    job_id: Optional[str] = Form(None),
    candidate_id: Optional[str] = Form(None),
    competency: str = Form(""),
):
    company_id = await get_user_company_id(user, db)
    data = await file.read()
    try:
        validate_upload(file.filename or "file.txt", file.content_type or "", len(data), settings.max_upload_mb)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    text = await extract_text(file.filename or "file.txt", data)
    upload_root = Path(settings.upload_dir)
    upload_root.mkdir(parents=True, exist_ok=True)
    doc_id = uuid.uuid4()
    dest = upload_root / f"{doc_id}_{file.filename}"
    dest.write_bytes(data)

    jid = uuid.UUID(job_id) if job_id else None
    cid = uuid.UUID(candidate_id) if candidate_id else None
    doc = Document(
        id=doc_id,
        company_id=company_id,
        job_id=jid,
        candidate_id=cid,
        document_type=document_type,
        filename=file.filename or "",
        mime_type=file.content_type or "",
        storage_path=str(dest),
        size_bytes=len(data),
        extracted_text=text,
        meta={"competency": competency},
    )
    db.add(doc)
    await db.flush()

    # Index knowledge / guidelines into pgvector
    if document_type in {"knowledge", "guideline", "question_bank", "policy", "jd", "resume"} and text.strip():
        chunks = chunk_text(text)
        vectors = await get_embedder().embed(chunks) if chunks else []
        for i, (chunk, vec) in enumerate(zip(chunks, vectors)):
            db.add(
                DocumentChunk(
                    document_id=doc.id,
                    company_id=company_id,
                    job_id=jid,
                    document_type=document_type,
                    competency=competency,
                    section=f"chunk-{i}",
                    source=file.filename or "",
                    chunk_index=i,
                    content=chunk,
                    embedding=vec,
                )
            )

    # Auto-parse resume/jd shortcuts
    parsed = None
    if document_type == "resume" and cid:
        profile = await parse_resume(get_llm(), text)
        cand = await db.get(Candidate, cid)
        if cand and cand.company_id == company_id:
            cand.raw_resume_text = text
            cand.full_name = cand.full_name or profile.candidate_name
            cand.email = cand.email or profile.email
            existing = (
                await db.execute(select(CandidateProfile).where(CandidateProfile.candidate_id == cid))
            ).scalar_one_or_none()
            if existing:
                for k, v in _profile_row_kwargs(profile).items():
                    setattr(existing, k, v)
            else:
                db.add(CandidateProfile(candidate_id=cid, **_profile_row_kwargs(profile)))
            parsed = profile.model_dump()
    if document_type == "jd" and jid:
        job = await db.get(Job, jid)
        if job and job.company_id == company_id:
            job.raw_jd_text = text
            extracted = await __import__("ai_recruiter", fromlist=["analyze_jd"]).analyze_jd(get_llm(), text)
            existing = (await db.execute(select(JobProfile).where(JobProfile.job_id == jid))).scalar_one_or_none()
            if existing:
                existing.title = extracted.title
                existing.required_skills = extracted.required_skills
                existing.preferred_skills = extracted.preferred_skills
                existing.experience = extracted.experience
                existing.responsibilities = extracted.responsibilities
                existing.technical_competencies = extracted.technical_competencies
                existing.behavioral_competencies = extracted.behavioral_competencies
            else:
                db.add(
                    JobProfile(
                        job_id=jid,
                        title=extracted.title,
                        required_skills=extracted.required_skills,
                        preferred_skills=extracted.preferred_skills,
                        experience=extracted.experience,
                        responsibilities=extracted.responsibilities,
                        technical_competencies=extracted.technical_competencies,
                        behavioral_competencies=extracted.behavioral_competencies,
                        raw_extraction=extracted.model_dump(),
                    )
                )
            parsed = extracted.model_dump()

    await db.commit()
    return {"id": str(doc.id), "extracted_text": text[:5000], "parsed": parsed}


@router.get("/documents/{document_id}")
async def get_document(
    document_id: uuid.UUID,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    doc = await db.get(Document, document_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": str(doc.id),
        "document_type": doc.document_type,
        "filename": doc.filename,
        "extracted_text": doc.extracted_text,
        "meta": doc.meta,
    }


@router.post("/resumes/parse")
async def parse_resume_endpoint(
    payload: dict[str, str],
    user: Annotated[User, Depends(require_recruiter)],
):
    text = payload.get("text", "")
    profile = await parse_resume(get_llm(), text)
    return profile.model_dump()


@router.post("/jobs/{job_id}/candidates", response_model=CandidateOut)
async def add_candidate(
    job_id: uuid.UUID,
    body: CandidateCreate,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    job = await db.get(Job, job_id)
    if not job or job.company_id != company_id:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = await parse_resume(get_llm(), body.raw_resume_text) if body.raw_resume_text.strip() else None
    cand = Candidate(
        company_id=company_id,
        job_id=job_id,
        full_name=body.full_name or (profile.candidate_name if profile else ""),
        email=body.email or (profile.email if profile else ""),
        phone=body.phone or (profile.phone if profile else ""),
        raw_resume_text=body.raw_resume_text,
    )
    db.add(cand)
    await db.flush()
    if profile:
        db.add(CandidateProfile(candidate_id=cand.id, **_profile_row_kwargs(profile)))
        # matching
        jp = (await db.execute(select(JobProfile).where(JobProfile.job_id == job_id))).scalar_one_or_none()
        if jp:
            job_extract = JobProfileExtract(
                title=jp.title,
                required_skills=jp.required_skills or [],
                preferred_skills=jp.preferred_skills or [],
                experience=jp.experience or "",
                seniority=(jp.raw_extraction or {}).get("seniority") or "",
                responsibilities=jp.responsibilities or [],
                technical_competencies=jp.technical_competencies or [],
                behavioral_competencies=jp.behavioral_competencies or [],
            )
            match = await match_resume_jd(get_llm(), profile, job_extract)
            db.add(
                ResumeJdMatch(
                    company_id=company_id,
                    job_id=job_id,
                    candidate_id=cand.id,
                    **_match_row_kwargs(match),
                )
            )
    await db.commit()
    return await get_candidate(cand.id, user, db)


@router.get("/candidates", response_model=list[CandidateOut])
async def list_candidates(
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    result = await db.execute(
        select(Candidate)
        .options(selectinload(Candidate.profile))
        .where(Candidate.company_id == company_id)
        .order_by(Candidate.created_at.desc())
    )
    return [_cand_out(c) for c in result.scalars().all()]


@router.get("/candidates/{candidate_id}", response_model=CandidateOut)
async def get_candidate(
    candidate_id: uuid.UUID,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    result = await db.execute(
        select(Candidate)
        .options(selectinload(Candidate.profile))
        .where(Candidate.id == candidate_id, Candidate.company_id == company_id)
    )
    cand = result.scalar_one_or_none()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _cand_out(cand)


@router.get("/candidates/{candidate_id}/match", response_model=MatchOut)
async def get_match(
    candidate_id: uuid.UUID,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    result = await db.execute(
        select(ResumeJdMatch)
        .where(ResumeJdMatch.candidate_id == candidate_id, ResumeJdMatch.company_id == company_id)
        .order_by(ResumeJdMatch.created_at.desc())
    )
    match = result.scalars().first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return MatchOut(
        strong_matches=match.strong_matches or [],
        partial_matches=match.partial_matches or [],
        missing=match.missing or [],
        claims_to_validate=match.claims_to_validate or [],
        relevant_projects=match.relevant_projects or [],
        potential_interview_areas=match.potential_interview_areas or [],
    )


def _cand_out(c: Candidate) -> CandidateOut:
    profile = None
    if c.profile:
        profile = {
            "candidate_name": c.profile.candidate_name,
            "email": c.profile.email,
            "phone": c.profile.phone,
            "summary": c.profile.summary,
            "skills": c.profile.skills,
            "experience": c.profile.experience,
            "education": c.profile.education,
            "projects": c.profile.projects,
            "certifications": c.profile.certifications,
            "achievements": c.profile.achievements,
        }
    return CandidateOut(
        id=c.id,
        full_name=c.full_name,
        email=c.email,
        phone=c.phone,
        job_id=c.job_id,
        profile=profile,
    )
