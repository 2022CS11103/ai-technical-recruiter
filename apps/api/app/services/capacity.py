"""Limit concurrent live interviews (cost control, like interview-agent)."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import InterviewSession, InterviewStatus


async def capacity_snapshot(db: AsyncSession) -> dict:
    settings = get_settings()
    max_sessions = int(settings.max_concurrent_interviews)
    active = (
        await db.execute(
            select(func.count())
            .select_from(InterviewSession)
            .where(InterviewSession.status == InterviewStatus.in_progress)
        )
    ).scalar() or 0
    has_capacity = int(active) < max_sessions
    return {
        "has_capacity": has_capacity,
        "active_sessions": int(active),
        "max_sessions": max_sessions,
        "message": "Capacity available" if has_capacity else "Maximum number of interviews reached. Please try again later.",
    }
