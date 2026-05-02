from dataclasses import dataclass
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from infrastructure.database.postgres.session import get_db
from infrastructure.database.postgres.user_repository_impl import UserRepositoryImpl
from infrastructure.security.jwt_service import JWTService
from infrastructure.security.token_blacklist import TokenBlacklistService
from domain.entities.user import User


security_scheme = HTTPBearer(auto_error=False)


@dataclass
class AuthenticatedUser:
    """Holds the authenticated user along with the raw token and its payload."""
    user: User
    token: str
    payload: dict


async def get_blacklist_service() -> TokenBlacklistService:
    """Dependency that provides a TokenBlacklistService instance."""
    service = TokenBlacklistService()
    try:
        yield service
    finally:
        await service.close()


async def authenticate_request(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
    blacklist: TokenBlacklistService = Depends(get_blacklist_service),
) -> AuthenticatedUser:
    """Dependency that extracts JWT from Authorization header and returns AuthenticatedUser"""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = JWTService.decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # Check if the token has been blacklisted (logged out)
    jti = payload.get("jti")
    if jti is not None:
        is_blacklisted = await blacklist.is_blacklisted(jti)
        if is_blacklisted:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked (logged out)",
                headers={"WWW-Authenticate": "Bearer"},
            )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user_repo = UserRepositoryImpl(db)
    user = await user_repo.get_by_id(int(user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return AuthenticatedUser(user=user, token=token, payload=payload)


async def get_current_user(
    auth: AuthenticatedUser = Depends(authenticate_request),
) -> User:
    """Dependency that returns just the User (for backward compatibility)."""
    return auth.user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
    blacklist: TokenBlacklistService = Depends(get_blacklist_service),
) -> Optional[User]:
    """Like get_current_user but returns None instead of 401 if no token"""
    if credentials is None:
        return None

    token = credentials.credentials
    payload = JWTService.decode_token(token)
    if payload is None:
        return None

    # Check blacklist too
    jti = payload.get("jti")
    if jti is not None:
        is_blacklisted = await blacklist.is_blacklisted(jti)
        if is_blacklisted:
            return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    user_repo = UserRepositoryImpl(db)
    return await user_repo.get_by_id(int(user_id))