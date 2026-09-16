from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, get_user_company_id
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import Company, CompanyMembership, User, UserRole
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    company = Company(name=body.company_name, slug=f"{body.company_name.lower().replace(' ', '-')}-{uuid4().hex[:6]}")
    user = User(
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=UserRole.recruiter,
    )
    db.add(company)
    db.add(user)
    await db.flush()
    db.add(CompanyMembership(company_id=company.id, user_id=user.id, role=UserRole.recruiter))
    await db.commit()
    token = create_access_token(str(user.id), {"role": user.role.value})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user.id), {"role": user.role.value})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]):
    company_id = await get_user_company_id(user, db)
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        company_id=company_id,
    )
