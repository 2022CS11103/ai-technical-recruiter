"""Company interview credits. Recruiter workspace owns the wallet; code owns the balance."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CreditLedger, CreditWallet

INTERVIEW_CREDIT_COST = 10
STARTER_CREDITS = 100


async def get_or_create_wallet(db: AsyncSession, company_id: uuid.UUID) -> CreditWallet:
    wallet = (
        await db.execute(select(CreditWallet).where(CreditWallet.company_id == company_id))
    ).scalar_one_or_none()
    if wallet:
        return wallet
    wallet = CreditWallet(company_id=company_id, balance=STARTER_CREDITS)
    db.add(wallet)
    await db.flush()
    return wallet


async def charge_interview(
    db: AsyncSession,
    company_id: uuid.UUID,
    *,
    session_id: Optional[uuid.UUID] = None,
    user_id: Optional[uuid.UUID] = None,
    cost: int = INTERVIEW_CREDIT_COST,
) -> CreditWallet:
    wallet = await get_or_create_wallet(db, company_id)
    if wallet.balance < cost:
        raise HTTPException(
            status_code=402,
            detail=f"Not enough interview credits ({wallet.balance} left, need {cost}). Top up in Billing.",
        )
    wallet.balance -= cost
    db.add(
        CreditLedger(
            company_id=company_id,
            amount=-cost,
            reason="interview_started",
            session_id=session_id,
            created_by=user_id,
        )
    )
    return wallet


async def topup(
    db: AsyncSession,
    company_id: uuid.UUID,
    amount: int,
    *,
    user_id: Optional[uuid.UUID] = None,
    reason: str = "topup",
) -> CreditWallet:
    if amount <= 0 or amount > 10_000:
        raise HTTPException(status_code=400, detail="Invalid credit amount")
    wallet = await get_or_create_wallet(db, company_id)
    wallet.balance += amount
    db.add(
        CreditLedger(
            company_id=company_id,
            amount=amount,
            reason=reason,
            created_by=user_id,
        )
    )
    return wallet
