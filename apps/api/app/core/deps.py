import uuid
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import safe_decode_token
from app.db.session import get_db
from app.models import CompanyMembership, User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    payload = safe_decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    try:
        user_id = uuid.UUID(payload["sub"])
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials") from exc
    result = await db.execute(
        select(User).options(selectinload(User.memberships)).where(User.id == user_id, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def require_recruiter(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in (UserRole.recruiter, UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recruiter access required")
    return user


async def get_user_company_id(user: User, db: AsyncSession) -> uuid.UUID:
    if not user.memberships:
        result = await db.execute(select(CompanyMembership).where(CompanyMembership.user_id == user.id).limit(1))
        membership = result.scalar_one_or_none()
        if not membership:
            raise HTTPException(status_code=400, detail="User has no company membership")
        return membership.company_id
    return user.memberships[0].company_id


async def assert_company_access(user: User, company_id: uuid.UUID, db: AsyncSession) -> None:
    if user.role == UserRole.admin:
        return
    result = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.user_id == user.id,
            CompanyMembership.company_id == company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-tenant access denied")
