import base64
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ai_recruiter.planner import clean_topic_name
from ai_recruiter.schemas import InterviewState

from app.core.deps import get_user_company_id, require_recruiter
from app.core.redis_client import get_redis
from app.core.security import generate_interview_token, hash_token, safe_decode_token
from app.db.session import AsyncSessionLocal, get_db
from app.models import (
    Answer,
    AnswerEvaluation,
    AuditLog,
    Candidate,
    CandidateProfile,
    Company,
    Competency,
    CompetencyScore,
    InterviewQuestion,
    InterviewReport,
    InterviewSession,
    InterviewStateRow,
    InterviewStatus,
    Job,
    JobProfile,
    Recommendation,
    ResumeJdMatch,
    User,
)
from app.schemas import AnswerIn, ConsentIn, InterviewCreate, InterviewOut, OverviewStats, ReportOverride
from app.services.ai_factory import get_stt, get_tts, get_tts_for_interviewer, make_agent
from app.core.config import get_settings

router = APIRouter(tags=["interviews"])
log = logging.getLogger("interview.conversation")


def _chat_log(who: str, text: str, session_id: str | None = None, note: str = "") -> None:
    """Print interview dialogue to the API terminal (easy to read while testing voice)."""
    line = (text or "").replace("\n", " ").strip()
    if len(line) > 500:
        line = line[:500] + "…"
    sid = (session_id or "")[:8]
    tag = f" ({note})" if note else ""
    msg = f"[interview {sid}] {who}{tag}: {line}"
    log.info(msg)
    print(msg, flush=True)


def _chat_banner(title: str, session_id: str | None = None) -> None:
    sid = (session_id or "")[:8]
    print(f"\n========== {title} [{sid}] ==========", flush=True)


def _rec_from_str(value: str) -> Recommendation:
    mapping = {
        "strong_yes": Recommendation.strong_yes,
        "yes": Recommendation.yes,
        "maybe": Recommendation.maybe,
        "no": Recommendation.no,
        "insufficient_evidence": Recommendation.insufficient_evidence,
    }
    return mapping.get(value, Recommendation.insufficient_evidence)


async def _load_context(db: AsyncSession, session: InterviewSession) -> dict[str, Any]:
    from app.models import CandidateProfile, JobProfile

    job = await db.get(Job, session.job_id)
    cand = await db.get(Candidate, session.candidate_id)
    comps = (
        await db.execute(select(Competency).where(Competency.job_id == session.job_id))
    ).scalars().all()
    match = (
        await db.execute(
            select(ResumeJdMatch)
            .where(ResumeJdMatch.candidate_id == session.candidate_id, ResumeJdMatch.job_id == session.job_id)
            .order_by(ResumeJdMatch.created_at.desc())
        )
    ).scalars().first()
    profile = (
        await db.execute(select(CandidateProfile).where(CandidateProfile.candidate_id == session.candidate_id))
    ).scalar_one_or_none()
    job_profile = (
        await db.execute(select(JobProfile).where(JobProfile.job_id == session.job_id))
    ).scalar_one_or_none()
    interviewer_name = (session.plan or {}).get("interviewer_name") or (session.consent_snapshot or {}).get(
        "interviewer_name"
    ) or "Sarah"
    projects = []
    skills = []
    experience = []
    if profile:
        projects = profile.projects or []
        skills = profile.skills or []
        experience = profile.experience or []

    candidate_name = (cand.full_name if cand and cand.full_name else "") or (
        profile.candidate_name if profile and profile.candidate_name else ""
    )
    resume_text = cand.raw_resume_text if cand else ""
    if resume_text:
        try:
            from ai_recruiter.parsing import _extract_person_name

            extracted = _extract_person_name(resume_text)
            canned = {"alex", "alex rivera", "candidate", "resume", "cv"}
            name_l = (candidate_name or "").strip().lower()
            if extracted and (
                not name_l
                or name_l in canned
                or name_l not in resume_text.lower()
            ):
                candidate_name = extracted
        except Exception:
            pass

    return {
        "company_id": str(session.company_id),
        "job_id": str(session.job_id),
        "candidate_id": str(session.candidate_id),
        "job_title": job.title if job else "",
        "candidate_name": candidate_name,
        "duration_minutes": session.duration_minutes,
        "difficulty": job.difficulty if job else "adaptive",
        "competencies": {c.name: c.weight_pct for c in comps},
        "mandatory_questions": [],
        "interviewer_name": interviewer_name,
        "match": {
            "strong_matches": match.strong_matches if match else [],
            "partial_matches": match.partial_matches if match else [],
            "missing": match.missing if match else [],
            "claims_to_validate": match.claims_to_validate if match else [],
            "suspicious_claims": ((match.raw or {}).get("suspicious_claims") if match else []) or [],
            "relevant_projects": match.relevant_projects if match else [],
            "potential_interview_areas": match.potential_interview_areas if match else [],
        }
        if match
        else {},
        "resume_text": (resume_text[:8000] if resume_text else ""),
        "resume_projects": projects,
        "resume_skills": skills,
        "resume_experience": experience,
        "resume_claims": (
            ((profile.raw_extraction or {}).get("claims") if profile else None)
            or (profile.achievements if profile else [])
            or (match.claims_to_validate if match else [])
            or []
        ),
        "resume_metrics": ((profile.raw_extraction or {}).get("metrics") if profile else []) or [],
        "resume_technologies": (
            ((profile.raw_extraction or {}).get("technologies") if profile else None) or skills
        ),
        "resume_summary": (profile.summary if profile else "") or "",
        "candidate_profile": {
            "name": candidate_name,
            "skills": skills,
            "technologies": ((profile.raw_extraction or {}).get("technologies") if profile else None) or skills,
            "projects": projects,
            "experience": experience,
            "claims": (
                ((profile.raw_extraction or {}).get("claims") if profile else None)
                or (profile.achievements if profile else [])
                or []
            ),
            "metrics": ((profile.raw_extraction or {}).get("metrics") if profile else []) or [],
            "summary": (profile.summary if profile else "") or "",
        },
        "jd_text": ((job.raw_jd_text or "")[:3000] if job else ""),
        "jd_required_skills": (job_profile.required_skills if job_profile else []) or [],
        "jd_preferred_skills": (job_profile.preferred_skills if job_profile else []) or [],
        "jd_responsibilities": (job_profile.responsibilities if job_profile else []) or [],
        "jd_experience": (job_profile.experience if job_profile else "") or "",
        "seniority": ((job_profile.raw_extraction or {}).get("seniority") if job_profile else "") or "",
        "interview_plan": session.plan or {},
    }


async def _speak(text: str, interviewer_name: str | None = None) -> str | None:
    """Optional server TTS. Keep this tiny — Next.js proxy dies if /answer waits on edge-tts.

    The candidate room speaks with the browser Web Speech API immediately when `reply` arrives.
    """
    if not text or not text.strip():
        return None
    try:
        audio = await asyncio.wait_for(
            get_tts_for_interviewer(interviewer_name).synthesize(text),
            timeout=2.0,
        )
        if audio:
            return base64.b64encode(audio).decode("ascii")
    except Exception as exc:
        print(f"[tts] skipped: {exc}", flush=True)
        return None
    return None


def _topic_context(state: InterviewState) -> dict[str, Any]:
    """UI label so candidates know which project/internship a question is about."""
    section = (state.current_section or "").lower()
    project = (state.current_project or "").strip()
    claim = (state.current_claim or "").strip()
    competency = (state.current_competency or "").strip()
    # Fallback: pull from the planned competency if state fields were not synced yet.
    if not project or not claim:
        for item in state.plan.get("competencies") or []:
            if not isinstance(item, dict):
                continue
            if str(item.get("name") or "").lower() != competency.lower():
                continue
            if not project:
                project = clean_topic_name(str(item.get("project") or "")) or project
            if not claim:
                claim = str(item.get("claim") or "").strip() or claim
            break
    label = None
    kind = "general"

    def _looks_internship(text: str) -> bool:
        low = text.lower()
        return any(w in low for w in ("intern", "internship", "trainee", "apprentice"))

    if section in {"introduction", "end", "closing", "wrap_up", "wrap-up"}:
        kind = "general"
        label = None
    elif project:
        if _looks_internship(project):
            kind = "internship"
            label = f"Internship: {project[:72]}"
        else:
            kind = "project"
            label = f"Project: {project}"
    elif claim:
        if _looks_internship(claim):
            kind = "internship"
            label = f"Internship: {claim[:72]}"
        else:
            kind = "claim"
            label = f"From your resume: {claim[:72]}"
    elif competency and competency.lower() not in {
        "resume",
        "general",
        "communication",
        "introduction",
        "closing",
    }:
        kind = "topic"
        label = f"Topic: {competency}"
    return {
        "kind": kind,
        "label": label,
        "project": project or None,
        "claim": claim or None,
        "competency": competency or None,
        "section": section or None,
    }


async def _persist_state(db: AsyncSession, session: InterviewSession, state: InterviewState) -> None:
    row = (
        await db.execute(select(InterviewStateRow).where(InterviewStateRow.session_id == session.id))
    ).scalar_one_or_none()
    payload = state.model_dump()
    if row:
        row.state = payload
    else:
        db.add(InterviewStateRow(session_id=session.id, state=payload))
    try:
        redis = await get_redis()
        await redis.setex(f"interview:{session.id}", 3600, json.dumps(payload))
    except Exception:
        pass


@router.get("/dashboard/overview", response_model=OverviewStats)
async def overview(
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    active_jobs = (
        await db.execute(select(func.count()).select_from(Job).where(Job.company_id == company_id, Job.status == "open"))
    ).scalar() or 0
    upcoming = (
        await db.execute(
            select(func.count())
            .select_from(InterviewSession)
            .where(
                InterviewSession.company_id == company_id,
                InterviewSession.status.in_([InterviewStatus.draft, InterviewStatus.scheduled]),
            )
        )
    ).scalar() or 0
    completed = (
        await db.execute(
            select(func.count())
            .select_from(InterviewSession)
            .where(InterviewSession.company_id == company_id, InterviewSession.status == InterviewStatus.completed)
        )
    ).scalar() or 0
    candidates = (
        await db.execute(select(func.count()).select_from(Candidate).where(Candidate.company_id == company_id))
    ).scalar() or 0
    avg = (
        await db.execute(
            select(func.avg(InterviewReport.overall_score)).where(InterviewReport.company_id == company_id)
        )
    ).scalar() or 0.0
    needing = (
        await db.execute(
            select(func.count())
            .select_from(InterviewReport)
            .where(InterviewReport.company_id == company_id, InterviewReport.human_override.is_(None))
        )
    ).scalar() or 0
    return OverviewStats(
        active_jobs=active_jobs,
        upcoming_interviews=upcoming,
        completed_interviews=completed,
        candidates=candidates,
        average_score=float(avg or 0),
        interviews_needing_review=needing,
    )


@router.post("/interviews", response_model=InterviewOut)
async def create_interview(
    body: InterviewCreate,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    job = await db.get(Job, body.job_id)
    cand = await db.get(Candidate, body.candidate_id)
    if not job or job.company_id != company_id:
        raise HTTPException(status_code=404, detail="Job not found")
    if not cand or cand.company_id != company_id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    token = generate_interview_token()
    session = InterviewSession(
        company_id=company_id,
        job_id=body.job_id,
        candidate_id=body.candidate_id,
        status=InterviewStatus.scheduled,
        token_hash=hash_token(token),
        duration_minutes=body.duration_minutes or job.interview_duration_minutes,
    )
    db.add(session)
    db.add(
        AuditLog(
            company_id=company_id,
            user_id=user.id,
            action="interview_created",
            resource_type="interview",
            resource_id="",
        )
    )
    await db.commit()
    await db.refresh(session)
    return InterviewOut(
        id=session.id,
        status=session.status.value,
        job_id=session.job_id,
        candidate_id=session.candidate_id,
        duration_minutes=session.duration_minutes,
        interview_url_token=token,
        plan=session.plan or {},
    )


@router.get("/interviews", response_model=list[InterviewOut])
async def list_interviews(
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    rows = (
        await db.execute(
            select(InterviewSession)
            .where(InterviewSession.company_id == company_id)
            .order_by(InterviewSession.created_at.desc())
        )
    ).scalars().all()
    return [
        InterviewOut(
            id=s.id,
            status=s.status.value,
            job_id=s.job_id,
            candidate_id=s.candidate_id,
            duration_minutes=s.duration_minutes,
            plan=s.plan or {},
        )
        for s in rows
    ]


@router.get("/interviews/{interview_id}", response_model=InterviewOut)
async def get_interview(
    interview_id: uuid.UUID,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    session = await db.get(InterviewSession, interview_id)
    if not session or session.company_id != company_id:
        raise HTTPException(status_code=404, detail="Interview not found")
    return InterviewOut(
        id=session.id,
        status=session.status.value,
        job_id=session.job_id,
        candidate_id=session.candidate_id,
        duration_minutes=session.duration_minutes,
        plan=session.plan or {},
    )


async def _session_by_token(db: AsyncSession, token: str) -> InterviewSession:
    th = hash_token(token)
    session = (
        await db.execute(select(InterviewSession).where(InterviewSession.token_hash == th))
    ).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid interview link")
    return session


@router.post("/interview-links/extract-document")
async def extract_document_public(file: UploadFile = File(...)):
    """Public helper so candidates can upload JD/resume PDF/DOCX/TXT before starting."""
    from app.core.config import get_settings
    from app.services.documents import extract_text, validate_upload

    data = await file.read()
    try:
        validate_upload(file.filename or "file.txt", file.content_type or "", len(data), get_settings().max_upload_mb)
        text = await extract_text(file.filename or "file.txt", data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not text.strip() or text.startswith("[OCR_REQUIRED]"):
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from this file. Try another format or paste the text.",
        )
    return {"filename": file.filename, "text": text}


@router.post("/interview-links/self-serve")
async def self_serve_interview(
    payload: dict[str, Any],
    db: Annotated[AsyncSession, Depends(get_db)],
    authorization: Annotated[Optional[str], Header()] = None,
):
    """Candidate opens interview by pasting JD + resume. No recruiter login required."""
    from ai_recruiter import analyze_jd, match_resume_jd, parse_resume
    from app.services.ai_factory import get_llm
    from uuid import uuid4

    jd_text = (payload.get("jd_text") or "").strip()
    resume_text = (payload.get("resume_text") or "").strip()
    interviewer_name = (payload.get("interviewer_name") or "Sarah").strip().title()
    if interviewer_name.lower() not in {"sarah", "rahul"}:
        interviewer_name = "Sarah"
    duration = int(payload.get("duration_minutes") or 30)
    if not jd_text or not resume_text:
        raise HTTPException(status_code=400, detail="Both job description and resume are required")

    company = Company(name="Self-Serve Interview", slug=f"self-{uuid4().hex[:8]}")
    db.add(company)
    await db.flush()

    llm = get_llm()
    jd = await analyze_jd(llm, jd_text)
    resume = await parse_resume(llm, resume_text)
    # Always prefer a name literally present in the pasted resume text
    from ai_recruiter.parsing import _extract_person_name

    extracted_name = _extract_person_name(resume_text)
    if extracted_name and extracted_name.lower() not in {"candidate", "resume", "cv"}:
        resume.candidate_name = extracted_name
    # Never keep canned demo name if it's not in the pasted text
    if resume.candidate_name and resume.candidate_name.lower() not in resume_text.lower():
        resume.candidate_name = extracted_name or "Candidate"

    match = await match_resume_jd(llm, resume, jd)

    plan_context = {
        "job_title": jd.title or payload.get("job_title") or "Technical Role",
        "duration_minutes": duration,
        "difficulty": "adaptive",
        "competencies": {name: 1 for name in (jd.technical_competencies or jd.required_skills or [])},
        "jd_required_skills": jd.required_skills,
        "jd_preferred_skills": jd.preferred_skills,
        "jd_responsibilities": jd.responsibilities,
        "jd_experience": jd.experience,
        "seniority": jd.seniority,
        "resume_skills": resume.skills,
        "resume_projects": resume.projects,
        "resume_experience": resume.experience,
        "resume_claims": resume.claims,
        "resume_metrics": resume.metrics,
        "resume_technologies": resume.technologies,
        "resume_summary": resume.summary,
        "candidate_name": resume.candidate_name,
        "candidate_profile": {
            "name": resume.candidate_name,
            "skills": resume.skills,
            "technologies": resume.technologies or resume.skills,
            "projects": resume.projects,
            "experience": resume.experience,
            "claims": resume.claims,
            "metrics": resume.metrics,
            "summary": resume.summary,
        },
        "match": match.model_dump(),
    }
    from ai_recruiter.planner import build_interview_plan

    interview_plan = await build_interview_plan(llm, plan_context)

    job = Job(
        company_id=company.id,
        title=jd.title or payload.get("job_title") or "Technical Role",
        raw_jd_text=jd_text,
        interview_duration_minutes=duration,
        difficulty="adaptive",
        interview_style="technical",
    )
    db.add(job)
    await db.flush()
    db.add(
        JobProfile(
            job_id=job.id,
            title=jd.title,
            required_skills=jd.required_skills,
            preferred_skills=jd.preferred_skills,
            experience=jd.experience,
            responsibilities=jd.responsibilities,
            technical_competencies=jd.technical_competencies,
            behavioral_competencies=jd.behavioral_competencies,
            raw_extraction=jd.model_dump(),
        )
    )
    comps = jd.technical_competencies or ["Communication"]
    weight = round(100 / len(comps), 2)
    for i, name in enumerate(comps):
        w = weight if i < len(comps) - 1 else round(100 - weight * (len(comps) - 1), 2)
        db.add(Competency(job_id=job.id, name=name, weight_pct=w))

    cand = Candidate(
        company_id=company.id,
        job_id=job.id,
        full_name=resume.candidate_name or "Candidate",
        email=resume.email or "",
        phone=resume.phone or "",
        raw_resume_text=resume_text,
        consent_given=True,
        consent_at=datetime.now(timezone.utc),
    )
    db.add(cand)
    await db.flush()
    if authorization and authorization.lower().startswith("bearer "):
        decoded = safe_decode_token(authorization.split(" ", 1)[1])
        if decoded and decoded.get("sub"):
            try:
                logged = await db.get(User, uuid.UUID(str(decoded["sub"])))
            except ValueError:
                logged = None
            if logged and logged.is_active:
                cand.user_id = logged.id
                if logged.email:
                    cand.email = logged.email
    db.add(
        CandidateProfile(
            candidate_id=cand.id,
            candidate_name=resume.candidate_name or "",
            email=resume.email or "",
            phone=resume.phone or "",
            summary=resume.summary or "",
            skills=resume.skills or [],
            experience=resume.experience or [],
            education=resume.education or [],
            projects=resume.projects or [],
            certifications=resume.certifications or [],
            achievements=(resume.achievements or resume.claims or [])[:10],
            source_evidence=resume.source_evidence or {},
            raw_extraction={
                **resume.model_dump(),
                "claims": resume.claims,
                "metrics": resume.metrics,
                "technologies": resume.technologies,
            },
        )
    )
    match_payload = match.model_dump()
    db.add(
        ResumeJdMatch(
            company_id=company.id,
            job_id=job.id,
            candidate_id=cand.id,
            strong_matches=match.strong_matches,
            partial_matches=match.partial_matches,
            missing=match.missing,
            claims_to_validate=match.claims_to_validate,
            relevant_projects=match.relevant_projects,
            potential_interview_areas=match.potential_interview_areas,
            raw=match_payload,
        )
    )

    token = generate_interview_token()
    session = InterviewSession(
        company_id=company.id,
        job_id=job.id,
        candidate_id=cand.id,
        status=InterviewStatus.scheduled,
        token_hash=hash_token(token),
        duration_minutes=duration,
        plan={
            **interview_plan.model_dump(),
            "interviewer_name": interviewer_name,
        },
        consent_snapshot={
            "consent": True,
            "ai_disclosure": True,
            "recording_disclosure": True,
            "interviewer_name": interviewer_name,
            "at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.add(session)
    try:
        from app.services.rag_index import index_interview_corpus

        await index_interview_corpus(
            db,
            company_id=company.id,
            job_id=job.id,
            candidate_id=cand.id,
            jd_text=jd_text,
            resume_text=resume_text,
        )
    except Exception as exc:
        print(f"[rag] ingest skipped: {exc}", flush=True)
    await db.commit()
    return {
        "token": token,
        "interview_id": str(session.id),
        "role": job.title,
        "interviewer_name": interviewer_name,
        "candidate_name": cand.full_name,
        "duration_minutes": duration,
        "match": match.model_dump(),
        "candidate_id": str(cand.id),
        "plan": {
            "competencies": interview_plan.competencies,
            "claims": interview_plan.claims,
            "gaps": interview_plan.gaps,
        },
    }


@router.get("/interview-links/capacity")
async def interview_capacity(db: Annotated[AsyncSession, Depends(get_db)]):
    from app.services.capacity import capacity_snapshot

    return await capacity_snapshot(db)


@router.get("/interview-links/{token}")
async def interview_link_info(token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await _session_by_token(db, token)
    job = await db.get(Job, session.job_id)
    cand = await db.get(Candidate, session.candidate_id)
    interviewer_name = (session.plan or {}).get("interviewer_name") or "Sarah"
    return {
        "interview_id": str(session.id),
        "status": session.status.value,
        "role": job.title if job else "",
        "candidate_name": cand.full_name if cand else "",
        "candidate_id": str(session.candidate_id),
        "duration_minutes": session.duration_minutes,
        "allow_pause": job.allow_pause if job else True,
        "consent_required": True,
        "interviewer_name": interviewer_name,
    }


@router.post("/interview-links/{token}/consent")
async def consent(token: str, body: ConsentIn, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await _session_by_token(db, token)
    if not body.consent:
        raise HTTPException(status_code=400, detail="Consent required")
    cand = await db.get(Candidate, session.candidate_id)
    if cand:
        cand.consent_given = True
        cand.consent_at = datetime.now(timezone.utc)
    session.consent_snapshot = {
        "consent": True,
        "ai_disclosure": True,
        "recording_disclosure": True,
        "at": datetime.now(timezone.utc).isoformat(),
        "interviewer_name": (session.plan or {}).get("interviewer_name") or "Sarah",
    }
    await db.commit()
    return {"ok": True}


@router.post("/interview-links/{token}/start")
async def start_by_token(token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await _session_by_token(db, token)
    return await _start_session(session, db)


@router.post("/interviews/{interview_id}/start")
async def start_interview(
    interview_id: uuid.UUID,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    session = await db.get(InterviewSession, interview_id)
    if not session or session.company_id != company_id:
        raise HTTPException(status_code=404, detail="Interview not found")
    return await _start_session(session, db)


async def _start_session(session: InterviewSession, db: AsyncSession) -> dict[str, Any]:
    if not session.consent_snapshot.get("consent"):
        # allow recruiter-triggered starts in demo; candidate path enforces consent
        session.consent_snapshot = {**session.consent_snapshot, "consent": True, "source": "recruiter"}
    context = await _load_context(db, session)

    # Idempotent start: avoid regenerating greeting + TTS on duplicate /start calls
    if session.status == InterviewStatus.in_progress:
        try:
            state = await _get_state(db, session)
            reply = state.last_question or (state.conversation_history[-1]["content"] if state.conversation_history else "")
            if reply:
                return {
                    "reply": reply,
                    "state": state.model_dump(),
                    "audio_base64": None,
                    "interviewer_name": context.get("interviewer_name", "Sarah"),
                    "candidate_name": context.get("candidate_name", ""),
                    "already_started": True,
                }
        except Exception:
            pass

    state = InterviewState(
        session_id=str(session.id),
        candidate_id=str(session.candidate_id),
        job_id=str(session.job_id),
        company_id=str(session.company_id),
        time_remaining=session.duration_minutes * 60,
    )
    agent = make_agent(db)
    state, reply = await agent.start(state, context)
    _chat_banner("INTERVIEW START — greeting", str(session.id))
    _chat_log("AI", reply, str(session.id), note="greeting")
    session.status = InterviewStatus.in_progress
    session.started_at = datetime.now(timezone.utc)
    session.plan = {**(session.plan or {}), **(state.plan or {}), "interviewer_name": context.get("interviewer_name", "Sarah")}
    db.add(
        AuditLog(
            company_id=session.company_id,
            action="interview_started",
            resource_type="interview",
            resource_id=str(session.id),
        )
    )
    await _persist_state(db, session, state)
    q = InterviewQuestion(
        session_id=session.id,
        competency="introduction",
        question_text=reply,
        difficulty=state.difficulty,
        source="introduction",
        sequence=0,
    )
    db.add(q)
    await db.commit()
    return {
        "reply": reply,
        "state": state.model_dump(),
        "audio_base64": None,
        "interviewer_name": context.get("interviewer_name", "Sarah"),
        "candidate_name": context.get("candidate_name", ""),
        "topic": _topic_context(state),
    }


async def _get_state(db: AsyncSession, session: InterviewSession) -> InterviewState:
    try:
        redis = await get_redis()
        raw = await redis.get(f"interview:{session.id}")
        if raw:
            return InterviewState.model_validate(json.loads(raw))
    except Exception:
        pass
    row = (
        await db.execute(select(InterviewStateRow).where(InterviewStateRow.session_id == session.id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=400, detail="Interview not started")
    return InterviewState.model_validate(row.state)


@router.post("/interview-links/{token}/answer")
async def answer_by_token(token: str, body: AnswerIn, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await _session_by_token(db, token)
    return await _answer(session, body.answer_text, db)


@router.post("/interviews/{interview_id}/answer")
async def answer_interview(
    interview_id: uuid.UUID,
    body: AnswerIn,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    session = await db.get(InterviewSession, interview_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    return await _answer(session, body.answer_text, db)


async def _answer(session: InterviewSession, answer_text: str, db: AsyncSession) -> dict[str, Any]:
    if session.status == InterviewStatus.paused:
        raise HTTPException(status_code=400, detail="Interview paused")
    _chat_banner("CANDIDATE TURN", str(session.id))
    _chat_log("YOU", answer_text, str(session.id), note="spoken answer")
    state = await _get_state(db, session)
    context = await _load_context(db, session)
    agent = make_agent(db)
    # store answer against last question
    last_q = (
        await db.execute(
            select(InterviewQuestion)
            .where(InterviewQuestion.session_id == session.id)
            .order_by(InterviewQuestion.sequence.desc())
        )
    ).scalars().first()
    if last_q:
        ans = Answer(question_id=last_q.id, session_id=session.id, answer_text=answer_text)
        db.add(ans)
        await db.flush()
    else:
        ans = None

    state, reply, meta = await agent.turn(state, answer_text, context)
    evaluation = meta.get("evaluation")
    spoken = reply
    if meta.get("preface"):
        spoken = f"{meta['preface']} {reply}".strip()
    _chat_log("AI", spoken, str(session.id), note="follow-up / next question")
    if meta.get("action"):
        print(f"[interview {str(session.id)[:8]}] action={meta.get('action')}", flush=True)
    if ans and evaluation:
        db.add(
            AnswerEvaluation(
                answer_id=ans.id,
                competencies=evaluation.get("competencies") or [],
                correctness=int(evaluation.get("correctness") or 0),
                depth=int(evaluation.get("depth") or 0),
                reasoning=int(evaluation.get("reasoning") or 0),
                clarity=int(evaluation.get("clarity") or 0),
                evidence=evaluation.get("evidence") or [],
                missing_points=evaluation.get("missing_points") or [],
                confidence=float(evaluation.get("confidence") or 0),
                status=evaluation.get("status") or "scored",
                raw=evaluation,
            )
        )

    if meta.get("action") == "END" or state.current_section == "end":
        await _persist_state(db, session, state)
        finished = await _finish(session, db, state)
        finished["reply"] = reply
        finished["audio_base64"] = None
        return finished

    # Meta turns (repeat / wait / clarify) should not create a new scored question row.
    if meta.get("action") in {
        "REPEAT",
        "WAIT",
        "CLARIFY",
        "CLARIFY_SCOPE",
        "REDIRECT",
        "COMPANY_QA",
        "PAUSED",
        "PARAPHRASE",
        "AWAIT_ANSWER",
    }:
        await _persist_state(db, session, state)
        await db.commit()
        return {"reply": spoken, "meta": meta, "state": state.model_dump(), "audio_base64": None, "topic": _topic_context(state)}

    q = InterviewQuestion(
        session_id=session.id,
        competency=state.current_competency,
        question_text=spoken,
        difficulty=state.difficulty,
        source=(meta.get("question") or {}).get("source", "generated"),
        expected_concepts=(meta.get("question") or {}).get("expected_concepts") or [],
        sequence=state.questions_asked,
        meta=meta.get("question") or {},
    )
    db.add(q)
    await _persist_state(db, session, state)
    await db.commit()
    return {"reply": spoken, "meta": meta, "state": state.model_dump(), "audio_base64": None, "topic": _topic_context(state)}


async def _interrupt_session(session: InterviewSession, db: AsyncSession) -> dict[str, Any]:
    state = await _get_state(db, session)
    agent = make_agent(db)
    state = await agent.manager.handle_interrupt(state)
    await _persist_state(db, session, state)
    await db.commit()
    return {"ok": True}


@router.post("/interview-links/{token}/interrupt")
async def interrupt_token(token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    return await _interrupt_session(await _session_by_token(db, token), db)


@router.post("/interviews/{interview_id}/interrupt")
async def interrupt_id(interview_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await db.get(InterviewSession, interview_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    return await _interrupt_session(session, db)


async def _repeat_session(session: InterviewSession, db: AsyncSession) -> dict[str, Any]:
    state = await _get_state(db, session)
    agent = make_agent(db)
    text = await agent.manager.repeat_question(state)
    interviewer = (session.plan or {}).get("interviewer_name") or "Sarah"
    audio_b64 = await _speak(text, interviewer)
    return {"reply": text, "audio_base64": audio_b64}


@router.post("/interview-links/{token}/repeat")
async def repeat_token(token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    return await _repeat_session(await _session_by_token(db, token), db)


@router.post("/interviews/{interview_id}/repeat")
async def repeat_id(interview_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await db.get(InterviewSession, interview_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    return await _repeat_session(session, db)


@router.post("/interview-links/{token}/pause")
async def pause_token(token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await _session_by_token(db, token)
    state = await _get_state(db, session)
    state = await make_agent(db).manager.pause(state)
    session.status = InterviewStatus.paused
    await _persist_state(db, session, state)
    await db.commit()
    return {"ok": True, "status": "paused"}


@router.post("/interviews/{interview_id}/pause")
async def pause_id(interview_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await db.get(InterviewSession, interview_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    state = await _get_state(db, session)
    state = await make_agent(db).manager.pause(state)
    session.status = InterviewStatus.paused
    await _persist_state(db, session, state)
    await db.commit()
    return {"ok": True, "status": "paused"}


@router.post("/interview-links/{token}/resume")
async def resume_token(token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await _session_by_token(db, token)
    state, msg = await make_agent(db).manager.resume(await _get_state(db, session))
    session.status = InterviewStatus.in_progress
    await _persist_state(db, session, state)
    await db.commit()
    return {"reply": msg}


@router.post("/interviews/{interview_id}/resume")
async def resume_id(interview_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await db.get(InterviewSession, interview_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    state, msg = await make_agent(db).manager.resume(await _get_state(db, session))
    session.status = InterviewStatus.in_progress
    await _persist_state(db, session, state)
    await db.commit()
    return {"reply": msg}


@router.post("/interview-links/{token}/finish")
async def finish_token(token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await _session_by_token(db, token)
    return await _finish(session, db, await _get_state(db, session))


@router.post("/interviews/{interview_id}/finish")
async def finish_id(interview_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]):
    session = await db.get(InterviewSession, interview_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    return await _finish(session, db, await _get_state(db, session))


async def _finish(session: InterviewSession, db: AsyncSession, state: InterviewState) -> dict[str, Any]:
    context = await _load_context(db, session)
    agent = make_agent(db)
    report = await agent.finish(state, context)
    session.status = InterviewStatus.completed
    session.ended_at = datetime.now(timezone.utc)
    evidence_map = state.competency_evidence or {}
    for name, score in (report.competency_scores or state.competency_scores).items():
        quotes = evidence_map.get(name) or []
        existing = (
            await db.execute(
                select(CompetencyScore).where(
                    CompetencyScore.session_id == session.id, CompetencyScore.competency == name
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.score_0_to_100 = float(score)
            existing.evidence = quotes
        else:
            db.add(
                CompetencyScore(
                    session_id=session.id,
                    competency=name,
                    score_0_to_100=float(score),
                    evidence=quotes,
                )
            )
    existing_report = (
        await db.execute(select(InterviewReport).where(InterviewReport.session_id == session.id))
    ).scalar_one_or_none()
    payload = {
        "overall_score": report.overall_score,
        "recommendation": _rec_from_str(report.recommendation),
        "strengths": report.strengths,
        "weaknesses": report.weaknesses,
        "evidence": report.evidence,
        "resume_validation": report.resume_validation,
        "technical_gaps": report.technical_gaps,
        "behavioral_observations": report.behavioral_observations,
        "recommended_next_step": report.recommended_next_step,
        "candidate_facing": {
            "strengths": report.strengths,
            "weak_areas": report.weaknesses,
            "technical_gaps": report.technical_gaps,
            "suggested_learning_topics": report.technical_gaps,
            "improvement_suggestions": ["Practice explaining evaluation metrics and trade-offs aloud."],
        },
        "full_report": report.model_dump(),
    }
    if existing_report:
        for k, v in payload.items():
            setattr(existing_report, k, v)
        report_id = existing_report.id
    else:
        row = InterviewReport(session_id=session.id, company_id=session.company_id, **payload)
        db.add(row)
        await db.flush()
        report_id = row.id
    await _persist_state(db, session, state)
    await db.commit()
    return {
        "status": "completed",
        "report_id": str(report_id),
        "report": report.model_dump(),
        "candidate_id": str(session.candidate_id),
        "session_id": str(session.id),
    }


async def _build_dossier(db: AsyncSession, session: InterviewSession) -> dict[str, Any]:
    cand = await db.get(Candidate, session.candidate_id)
    job = await db.get(Job, session.job_id)
    report = (
        await db.execute(select(InterviewReport).where(InterviewReport.session_id == session.id))
    ).scalar_one_or_none()
    state_row = (
        await db.execute(select(InterviewStateRow).where(InterviewStateRow.session_id == session.id))
    ).scalar_one_or_none()
    questions = (
        await db.execute(
            select(InterviewQuestion)
            .options(selectinload(InterviewQuestion.answers).selectinload(Answer.evaluation))
            .where(InterviewQuestion.session_id == session.id)
            .order_by(InterviewQuestion.sequence)
        )
    ).scalars().all()
    scores = (
        await db.execute(select(CompetencyScore).where(CompetencyScore.session_id == session.id))
    ).scalars().all()
    state = (state_row.state or {}) if state_row else {}
    plan = session.plan or {}
    evaluations = []
    for q in questions:
        for a in q.answers:
            evaluations.append(
                {
                    "question": q.question_text,
                    "answer": a.answer_text,
                    "competency": q.competency,
                    "score": (a.evaluation.raw or {}).get("score_0_to_5") if a.evaluation else None,
                    "evaluation": (a.evaluation.raw or {}).get("probe_hint") if a.evaluation else "",
                    "evidence": a.evaluation.evidence if a.evaluation else [],
                    "missing_points": a.evaluation.missing_points if a.evaluation else [],
                    "status": a.evaluation.status if a.evaluation else "",
                }
            )
    rec = report.recommendation.value if report else "insufficient_evidence"
    rec_label = {
        "strong_yes": "Strong Hire",
        "yes": "Hire",
        "maybe": "Consider",
        "no": "No Hire",
        "insufficient_evidence": "Insufficient evidence",
    }.get(rec, rec)
    score_map = {row.competency: row.score_0_to_100 for row in scores} or (state.get("competency_scores") or {})
    evidence_map = state.get("competency_evidence") or {}
    if not evidence_map:
        evidence_map = {row.competency: (row.evidence or []) for row in scores if row.evidence}
    return {
        "candidate_id": str(session.candidate_id),
        "session_id": str(session.id),
        "status": session.status.value,
        "name": cand.full_name if cand else "Candidate",
        "email": cand.email if cand else "",
        "role": job.title if job else "",
        "date": session.created_at.strftime("%b %d, %Y") if session.created_at else "",
        "plan": {
            "competencies": plan.get("competencies") or [],
            "claims": plan.get("claims") or plan.get("resume_claims_to_validate") or [],
            "gaps": plan.get("gaps") or [],
        },
        "overall_score": report.overall_score if report else 0,
        "recommendation": rec_label,
        "strengths": report.strengths if report else [],
        "weaknesses": report.weaknesses if report else [],
        "evidence": report.evidence if report else [],
        "resume_validation": report.resume_validation if report else [],
        "technical_gaps": report.technical_gaps if report else [],
        "recommended_next_step": report.recommended_next_step if report else "",
        "competency_scores": score_map,
        "competency_evidence": evidence_map,
        "evidence_log": state.get("evidence_log") or [],
        "evaluations": evaluations,
        "conversation_history": state.get("conversation_history") or [],
        "report_id": str(report.id) if report else None,
    }


@router.get("/dossiers/recent")
async def list_recent_dossiers(db: Annotated[AsyncSession, Depends(get_db)]):
    """Live sessions for the recruiter UI (includes self-serve interviews)."""
    sessions = (
        await db.execute(select(InterviewSession).order_by(InterviewSession.created_at.desc()).limit(30))
    ).scalars().all()
    rows = []
    for session in sessions:
        dossier = await _build_dossier(db, session)
        rows.append(
            {
                "id": dossier["candidate_id"],
                "name": dossier["name"],
                "email": dossier["email"],
                "role": dossier["role"],
                "score": round((dossier["overall_score"] or 0) / 10, 1) if dossier["overall_score"] else None,
                "status": "Completed" if session.status == InterviewStatus.completed else "In Progress",
                "recommendation": dossier["recommendation"],
                "date": session.created_at.strftime("%b %d, %Y") if session.created_at else "",
            }
        )
    return rows


@router.get("/dossiers/{candidate_id}")
async def get_dossier(candidate_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]):
    session = (
        await db.execute(
            select(InterviewSession)
            .where(InterviewSession.candidate_id == candidate_id)
            .order_by(InterviewSession.created_at.desc())
        )
    ).scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="No interview found for this candidate")
    return await _build_dossier(db, session)


@router.get("/interview-links/{token}/dossier")
async def dossier_by_token(token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    return await _build_dossier(db, await _session_by_token(db, token))


async def _resolve(db: AsyncSession, token: Optional[str], interview_id: Optional[uuid.UUID]) -> InterviewSession:
    if token:
        return await _session_by_token(db, token)
    if interview_id:
        session = await db.get(InterviewSession, interview_id)
        if not session:
            raise HTTPException(status_code=404, detail="Interview not found")
        return session
    raise HTTPException(status_code=400, detail="token or interview_id required")


@router.get("/interviews/{interview_id}/transcript")
async def transcript(
    interview_id: uuid.UUID,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    session = await db.get(InterviewSession, interview_id)
    if not session or session.company_id != company_id:
        raise HTTPException(status_code=404, detail="Interview not found")
    state_row = (
        await db.execute(select(InterviewStateRow).where(InterviewStateRow.session_id == session.id))
    ).scalar_one_or_none()
    questions = (
        await db.execute(
            select(InterviewQuestion)
            .options(selectinload(InterviewQuestion.answers).selectinload(Answer.evaluation))
            .where(InterviewQuestion.session_id == session.id)
            .order_by(InterviewQuestion.sequence)
        )
    ).scalars().all()
    return {
        "conversation_history": (state_row.state or {}).get("conversation_history", []) if state_row else [],
        "turns": [
            {
                "question": q.question_text,
                "competency": q.competency,
                "answers": [
                    {
                        "text": a.answer_text,
                        "evaluation": a.evaluation.raw if a.evaluation else None,
                    }
                    for a in q.answers
                ],
            }
            for q in questions
        ],
    }


def _report_payload(report: InterviewReport) -> dict[str, Any]:
    return {
        "id": str(report.id),
        "session_id": str(report.session_id),
        "overall_score": report.overall_score,
        "recommendation": report.recommendation.value,
        "human_override": report.human_override,
        "recruiter_notes": report.recruiter_notes,
        "strengths": report.strengths,
        "weaknesses": report.weaknesses,
        "evidence": report.evidence,
        "resume_validation": report.resume_validation,
        "technical_gaps": report.technical_gaps,
        "behavioral_observations": report.behavioral_observations,
        "recommended_next_step": report.recommended_next_step,
        "candidate_facing": report.candidate_facing,
        "full_report": report.full_report,
    }


@router.get("/interviews/{interview_id}/report")
async def get_interview_report(
    interview_id: uuid.UUID,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    report = (
        await db.execute(select(InterviewReport).where(InterviewReport.session_id == interview_id))
    ).scalar_one_or_none()
    if not report or report.company_id != company_id:
        raise HTTPException(status_code=404, detail="Report not found")
    return _report_payload(report)


@router.get("/reports/{report_id}")
async def get_report(
    report_id: uuid.UUID,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    report = await db.get(InterviewReport, report_id)
    if not report or report.company_id != company_id:
        raise HTTPException(status_code=404, detail="Report not found")
    return _report_payload(report)


@router.post("/reports/{report_id}/override")
async def override_report(
    report_id: uuid.UUID,
    body: ReportOverride,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    report = await db.get(InterviewReport, report_id)
    if not report or report.company_id != company_id:
        raise HTTPException(status_code=404, detail="Report not found")
    report.human_override = body.human_override
    report.recruiter_notes = body.recruiter_notes
    db.add(
        AuditLog(
            company_id=company_id,
            user_id=user.id,
            action="report_override",
            resource_type="report",
            resource_id=str(report_id),
            details={"override": body.human_override},
        )
    )
    await db.commit()
    return {"ok": True}


@router.post("/interview-links/{token}/stt")
async def stt_endpoint(token: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    await _session_by_token(db, token)
    data = await file.read()
    if not data:
        return {"text": "", "error": "empty_audio"}
    settings = get_settings()
    if settings.use_mock_stt:
        return {
            "text": "",
            "error": "stt_not_configured",
            "hint": "Set LLM_API_KEY or STT_API_KEY in apps/api/.env (Groq key) and restart the API",
        }
    try:
        name = (file.filename or "").lower()
        mime = file.content_type or ""
        if name.endswith(".wav") or "wav" in mime:
            mime = "audio/wav"
        elif name.endswith(".mp4") or "mp4" in mime:
            mime = "audio/mp4"
        text = await get_stt().transcribe(data, mime or "audio/webm")
    except Exception as exc:
        print(f"[stt] failed: {exc}", flush=True)
        return {"text": "", "error": "stt_failed"}
    cleaned = (text or "").strip()
    if cleaned.startswith("[voice transcription unavailable"):
        return {"text": "", "error": "stt_mock"}
    _chat_log("YOU", cleaned, note="stt transcript")
    return {"text": cleaned}


@router.websocket("/ws/interviews/{token}")
async def interview_ws(websocket: WebSocket, token: str):
    await websocket.accept()
    async with AsyncSessionLocal() as db:
        try:
            session = await _session_by_token(db, token)
        except HTTPException:
            await websocket.send_json({"type": "error", "message": "Invalid token"})
            await websocket.close()
            return
        await websocket.send_json({"type": "connected", "interview_id": str(session.id)})
        try:
            while True:
                message = await websocket.receive_json()
                mtype = message.get("type")
                if mtype == "answer":
                    result = await _answer(session, message.get("text", ""), db)
                    await websocket.send_json({"type": "reply", **result})
                elif mtype == "interrupt":
                    state = await _get_state(db, session)
                    state = await make_agent(db).manager.handle_interrupt(state)
                    await _persist_state(db, session, state)
                    await db.commit()
                    await websocket.send_json({"type": "interrupted"})
                elif mtype == "repeat":
                    state = await _get_state(db, session)
                    text = await make_agent(db).manager.repeat_question(state)
                    await websocket.send_json({"type": "reply", "reply": text})
                elif mtype == "ping":
                    await websocket.send_json({"type": "pong"})
                else:
                    await websocket.send_json({"type": "error", "message": "Unknown message type"})
        except WebSocketDisconnect:
            return
        except Exception as exc:
            await websocket.send_json({"type": "error", "message": str(exc)})
