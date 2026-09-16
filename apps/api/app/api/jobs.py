from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ai_recruiter import analyze_jd

from app.core.deps import get_user_company_id, require_recruiter
from app.db.session import get_db
from app.models import Competency, Job, JobProfile, User
from app.schemas import JobCreate, JobOut, JobUpdate
from app.services.ai_factory import get_llm

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _job_out(job: Job) -> JobOut:
    profile = None
    if job.profile:
        profile = {
            "title": job.profile.title,
            "required_skills": job.profile.required_skills,
            "preferred_skills": job.profile.preferred_skills,
            "experience": job.profile.experience,
            "responsibilities": job.profile.responsibilities,
            "technical_competencies": job.profile.technical_competencies,
            "behavioral_competencies": job.profile.behavioral_competencies,
        }
    comps = [{"name": c.name, "weight_pct": c.weight_pct, "rubric": c.rubric} for c in job.competencies]
    return JobOut(
        id=job.id,
        title=job.title,
        status=job.status,
        interview_duration_minutes=job.interview_duration_minutes,
        difficulty=job.difficulty,
        interview_style=job.interview_style,
        raw_jd_text=job.raw_jd_text,
        profile=profile,
        competencies=comps,
    )


def _validate_weights(competencies: list[dict[str, Any]]) -> None:
    if not competencies:
        return
    total = sum(float(c.get("weight_pct", 0)) for c in competencies)
    if abs(total - 100.0) > 0.01:
        raise HTTPException(status_code=400, detail=f"Competency weights must total 100%, got {total}")


@router.post("", response_model=JobOut)
async def create_job(
    body: JobCreate,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _validate_weights(body.competencies)
    company_id = await get_user_company_id(user, db)
    job = Job(
        company_id=company_id,
        title=body.title,
        raw_jd_text=body.raw_jd_text,
        interview_duration_minutes=body.interview_duration_minutes,
        difficulty=body.difficulty,
        interview_style=body.interview_style,
        allow_pause=body.allow_pause,
        show_candidate_feedback=body.show_candidate_feedback,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    if body.raw_jd_text.strip():
        extracted = await analyze_jd(get_llm(), body.raw_jd_text)
        db.add(
            JobProfile(
                job_id=job.id,
                title=extracted.title or body.title,
                required_skills=extracted.required_skills,
                preferred_skills=extracted.preferred_skills,
                experience=extracted.experience,
                responsibilities=extracted.responsibilities,
                technical_competencies=extracted.technical_competencies,
                behavioral_competencies=extracted.behavioral_competencies,
                raw_extraction=extracted.model_dump(),
            )
        )
        if not body.competencies and extracted.technical_competencies:
            weights = round(100 / len(extracted.technical_competencies), 2)
            body.competencies = [{"name": n, "weight_pct": weights} for n in extracted.technical_competencies]
            # fix rounding
            if body.competencies:
                body.competencies[-1]["weight_pct"] = round(
                    100 - sum(c["weight_pct"] for c in body.competencies[:-1]), 2
                )

    for c in body.competencies:
        db.add(
            Competency(
                job_id=job.id,
                name=c["name"],
                weight_pct=float(c.get("weight_pct", 0)),
                rubric=c.get("rubric") or {},
            )
        )
    await db.commit()
    return await get_job(job.id, user, db)


@router.get("", response_model=list[JobOut])
async def list_jobs(
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    result = await db.execute(
        select(Job)
        .options(selectinload(Job.profile), selectinload(Job.competencies))
        .where(Job.company_id == company_id)
        .order_by(Job.created_at.desc())
    )
    return [_job_out(j) for j in result.scalars().all()]


@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: UUID,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    result = await db.execute(
        select(Job)
        .options(selectinload(Job.profile), selectinload(Job.competencies))
        .where(Job.id == job_id, Job.company_id == company_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_out(job)


@router.patch("/{job_id}", response_model=JobOut)
async def patch_job(
    job_id: UUID,
    body: JobUpdate,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    result = await db.execute(
        select(Job)
        .options(selectinload(Job.profile), selectinload(Job.competencies))
        .where(Job.id == job_id, Job.company_id == company_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    data = body.model_dump(exclude_unset=True)
    comps = data.pop("competencies", None)
    for k, v in data.items():
        setattr(job, k, v)
    if body.raw_jd_text is not None and body.raw_jd_text.strip():
        extracted = await analyze_jd(get_llm(), body.raw_jd_text)
        if job.profile:
            job.profile.title = extracted.title or job.title
            job.profile.required_skills = extracted.required_skills
            job.profile.preferred_skills = extracted.preferred_skills
            job.profile.experience = extracted.experience
            job.profile.responsibilities = extracted.responsibilities
            job.profile.technical_competencies = extracted.technical_competencies
            job.profile.behavioral_competencies = extracted.behavioral_competencies
            job.profile.raw_extraction = extracted.model_dump()
        else:
            db.add(
                JobProfile(
                    job_id=job.id,
                    title=extracted.title or job.title,
                    required_skills=extracted.required_skills,
                    preferred_skills=extracted.preferred_skills,
                    experience=extracted.experience,
                    responsibilities=extracted.responsibilities,
                    technical_competencies=extracted.technical_competencies,
                    behavioral_competencies=extracted.behavioral_competencies,
                    raw_extraction=extracted.model_dump(),
                )
            )
    if comps is not None:
        _validate_weights(comps)
        for existing in list(job.competencies):
            await db.delete(existing)
        await db.flush()
        for c in comps:
            db.add(
                Competency(
                    job_id=job.id,
                    name=c["name"],
                    weight_pct=float(c.get("weight_pct", 0)),
                    rubric=c.get("rubric") or {},
                )
            )
    await db.commit()
    return await get_job(job_id, user, db)


@router.post("/analyze")
async def analyze_job_text(
    payload: dict[str, str],
    user: Annotated[User, Depends(require_recruiter)],
):
    text = payload.get("text", "")
    extracted = await analyze_jd(get_llm(), text)
    return extracted.model_dump()
