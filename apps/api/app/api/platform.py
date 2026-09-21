"""Recruiter billing, candidate portal, and admin platform APIs."""
from __future__ import annotations

import uuid
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_user_company_id, require_admin, require_candidate, require_recruiter
from app.db.session import get_db
from app.models import (
    AuditLog,
    Candidate,
    CandidateProfile,
    CreditLedger,
    InterviewReport,
    InterviewSession,
    InterviewStatus,
    Job,
    User,
    UserRole,
)
from app.services.credits import INTERVIEW_CREDIT_COST, get_or_create_wallet, topup

router = APIRouter(tags=["platform"])


class TopupIn(BaseModel):
    amount: int = Field(ge=10, le=1000)


class ProfileIn(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    summary: Optional[str] = None


class BanIn(BaseModel):
    banned: bool = True
    reason: str = ""


async def _write_audit(
    db: AsyncSession,
    *,
    action: str,
    user_id: Optional[uuid.UUID] = None,
    company_id: Optional[uuid.UUID] = None,
    resource_type: str = "",
    resource_id: str = "",
    details: Optional[dict[str, Any]] = None,
) -> None:
    db.add(
        AuditLog(
            company_id=company_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
        )
    )


@router.get("/billing/credits")
async def billing_credits(
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    wallet = await get_or_create_wallet(db, company_id)
    ledger = (
        await db.execute(
            select(CreditLedger)
            .where(CreditLedger.company_id == company_id)
            .order_by(CreditLedger.created_at.desc())
            .limit(40)
        )
    ).scalars().all()
    await db.commit()
    return {
        "balance": wallet.balance,
        "interview_cost": INTERVIEW_CREDIT_COST,
        "ledger": [
            {
                "id": str(row.id),
                "amount": row.amount,
                "reason": row.reason,
                "created_at": row.created_at.isoformat() if row.created_at else "",
            }
            for row in ledger
        ],
    }


@router.post("/billing/credits/topup")
async def billing_topup(
    body: TopupIn,
    user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    company_id = await get_user_company_id(user, db)
    wallet = await topup(db, company_id, body.amount, user_id=user.id)
    await _write_audit(
        db,
        action="credits_topup",
        user_id=user.id,
        company_id=company_id,
        resource_type="credits",
        details={"amount": body.amount},
    )
    await db.commit()
    return {"balance": wallet.balance, "added": body.amount}


@router.get("/portal/me")
async def portal_me(
    user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(Candidate)
            .where(or_(Candidate.user_id == user.id, Candidate.email == user.email))
            .order_by(Candidate.created_at.desc())
        )
    ).scalars().all()
    primary = rows[0] if rows else None
    profile = None
    if primary:
        profile = (
            await db.execute(select(CandidateProfile).where(CandidateProfile.candidate_id == primary.id))
        ).scalar_one_or_none()
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "phone": primary.phone if primary else "",
        "summary": profile.summary if profile else "",
        "skills": profile.skills if profile else [],
        "candidate_ids": [str(row.id) for row in rows],
        "has_resume": bool(primary and primary.raw_resume_text),
    }


@router.patch("/portal/profile")
async def portal_profile(
    body: ProfileIn,
    user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if body.full_name:
        user.full_name = body.full_name.strip()
    cand = (
        await db.execute(
            select(Candidate)
            .where(or_(Candidate.user_id == user.id, Candidate.email == user.email))
            .order_by(Candidate.created_at.desc())
        )
    ).scalars().first()
    if cand:
        if body.full_name:
            cand.full_name = body.full_name.strip()
        if body.phone is not None:
            cand.phone = body.phone
        if body.summary is not None:
            profile = (
                await db.execute(select(CandidateProfile).where(CandidateProfile.candidate_id == cand.id))
            ).scalar_one_or_none()
            if profile:
                profile.summary = body.summary
            else:
                db.add(CandidateProfile(candidate_id=cand.id, candidate_name=cand.full_name, email=cand.email, summary=body.summary or ""))
    await _write_audit(db, action="candidate_profile_updated", user_id=user.id, resource_type="candidate")
    await db.commit()
    return {"ok": True}


@router.post("/portal/cv")
async def portal_cv(
    payload: dict[str, Any],
    user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    text = (payload.get("resume_text") or "").strip()
    if len(text) < 40:
        raise HTTPException(status_code=400, detail="Paste a fuller resume so ZARA can build your profile")
    from ai_recruiter import parse_resume
    from app.services.ai_factory import get_llm

    parsed = await parse_resume(get_llm(), text)
    cand = (
        await db.execute(
            select(Candidate)
            .where(or_(Candidate.user_id == user.id, Candidate.email == user.email))
            .order_by(Candidate.created_at.desc())
        )
    ).scalars().first()
    if not cand:
        from app.models import Company

        company = Company(name=f"{user.full_name} workspace", slug=f"cand-{uuid.uuid4().hex[:8]}")
        db.add(company)
        await db.flush()
        cand = Candidate(
            company_id=company.id,
            user_id=user.id,
            full_name=parsed.candidate_name or user.full_name,
            email=parsed.email or user.email,
            phone=parsed.phone or "",
            raw_resume_text=text,
        )
        db.add(cand)
        await db.flush()
    else:
        cand.user_id = user.id
        cand.raw_resume_text = text
        if parsed.candidate_name:
            cand.full_name = parsed.candidate_name
            user.full_name = parsed.candidate_name
        if parsed.email:
            cand.email = parsed.email
        if parsed.phone:
            cand.phone = parsed.phone
    profile = (
        await db.execute(select(CandidateProfile).where(CandidateProfile.candidate_id == cand.id))
    ).scalar_one_or_none()
    dump = parsed.model_dump()
    profile_kwargs = {k: dump[k] for k in (
        "candidate_name", "email", "phone", "summary", "skills", "experience",
        "education", "projects", "certifications", "achievements", "source_evidence",
    ) if k in dump}
    profile_kwargs["raw_extraction"] = dump
    if profile:
        for key, value in profile_kwargs.items():
            if hasattr(profile, key):
                setattr(profile, key, value)
    else:
        db.add(CandidateProfile(candidate_id=cand.id, **profile_kwargs))
    await _write_audit(db, action="cv_uploaded", user_id=user.id, resource_type="candidate", resource_id=str(cand.id))
    await db.commit()
    return {"ok": True, "candidate_id": str(cand.id), "profile": dump}


@router.get("/portal/interviews")
async def portal_history(
    user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    cands = (
        await db.execute(
            select(Candidate).where(or_(Candidate.user_id == user.id, Candidate.email == user.email))
        )
    ).scalars().all()
    ids = [c.id for c in cands]
    if not ids:
        return []
    sessions = (
        await db.execute(
            select(InterviewSession)
            .where(InterviewSession.candidate_id.in_(ids))
            .order_by(InterviewSession.created_at.desc())
        )
    ).scalars().all()
    rows = []
    for session in sessions:
        job = await db.get(Job, session.job_id)
        report = (
            await db.execute(select(InterviewReport).where(InterviewReport.session_id == session.id))
        ).scalar_one_or_none()
        rows.append(
            {
                "id": str(session.candidate_id),
                "session_id": str(session.id),
                "role": job.title if job else "Technical interview",
                "status": "Completed" if session.status == InterviewStatus.completed else "In Progress",
                "date": session.created_at.strftime("%b %d, %Y") if session.created_at else "",
                "has_feedback": bool(report),
            }
        )
    return rows


@router.get("/portal/interviews/{candidate_id}/feedback")
async def portal_feedback(
    candidate_id: uuid.UUID,
    user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    cand = await db.get(Candidate, candidate_id)
    if not cand or (cand.user_id != user.id and cand.email.lower() != user.email.lower() and user.role != UserRole.admin):
        raise HTTPException(status_code=404, detail="Interview not found")
    session = (
        await db.execute(
            select(InterviewSession)
            .where(InterviewSession.candidate_id == candidate_id)
            .order_by(InterviewSession.created_at.desc())
        )
    ).scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="No interview yet")
    report = (
        await db.execute(select(InterviewReport).where(InterviewReport.session_id == session.id))
    ).scalar_one_or_none()
    job = await db.get(Job, session.job_id)
    facing = (report.candidate_facing if report else {}) or {}
    return {
        "name": cand.full_name,
        "role": job.title if job else "",
        "status": session.status.value,
        "strengths": facing.get("strengths") or (report.strengths if report else []),
        "weak_areas": facing.get("weak_areas") or (report.weaknesses if report else []),
        "technical_gaps": facing.get("technical_gaps") or (report.technical_gaps if report else []),
        "suggested_learning_topics": facing.get("suggested_learning_topics") or (report.technical_gaps if report else []),
        "improvement_suggestions": facing.get("improvement_suggestions") or [],
        "note": "This is practice feedback from the interview evidence — not a hiring decision.",
    }


@router.get("/admin/overview")
async def admin_overview(
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    banned = (await db.execute(select(func.count()).select_from(User).where(User.is_active.is_(False)))).scalar() or 0
    sessions = (await db.execute(select(func.count()).select_from(InterviewSession))).scalar() or 0
    live = (
        await db.execute(
            select(func.count()).select_from(InterviewSession).where(InterviewSession.status == InterviewStatus.in_progress)
        )
    ).scalar() or 0
    completed = (
        await db.execute(
            select(func.count())
            .select_from(InterviewSession)
            .where(InterviewSession.status == InterviewStatus.completed)
        )
    ).scalar() or 0
    return {
        "users": users,
        "banned_users": banned,
        "interviews": sessions,
        "live_interviews": live,
        "completed_interviews": completed,
    }


@router.get("/admin/users")
async def admin_users(
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (await db.execute(select(User).order_by(User.created_at.desc()).limit(100))).scalars().all()
    return [
        {
            "id": str(row.id),
            "email": row.email,
            "full_name": row.full_name,
            "role": row.role.value,
            "is_active": row.is_active,
            "created_at": row.created_at.strftime("%b %d, %Y") if row.created_at else "",
        }
        for row in rows
    ]


@router.post("/admin/users/{user_id}/ban")
async def admin_ban_user(
    user_id: uuid.UUID,
    body: BanIn,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot ban yourself")
    target.is_active = not body.banned
    await _write_audit(
        db,
        action="user_banned" if body.banned else "user_unbanned",
        user_id=admin.id,
        resource_type="user",
        resource_id=str(target.id),
        details={"reason": body.reason, "email": target.email},
    )
    await db.commit()
    return {"ok": True, "is_active": target.is_active}


@router.get("/admin/interviews")
async def admin_monitor_interviews(
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    sessions = (
        await db.execute(select(InterviewSession).order_by(InterviewSession.created_at.desc()).limit(50))
    ).scalars().all()
    rows = []
    for session in sessions:
        cand = await db.get(Candidate, session.candidate_id)
        job = await db.get(Job, session.job_id)
        rows.append(
            {
                "session_id": str(session.id),
                "candidate_id": str(session.candidate_id),
                "name": cand.full_name if cand else "Candidate",
                "role": job.title if job else "",
                "status": session.status.value,
                "date": session.created_at.strftime("%b %d, %Y %H:%M") if session.created_at else "",
            }
        )
    return rows


@router.get("/admin/audit")
async def admin_audit(
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(50))
    ).scalars().all()
    return [
        {
            "id": str(row.id),
            "action": row.action,
            "resource_type": row.resource_type,
            "resource_id": row.resource_id,
            "details": row.details,
            "created_at": row.created_at.isoformat() if row.created_at else "",
        }
        for row in rows
    ]
