from dataclasses import dataclass
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from infrastructure.database.postgres.session import get_session
from infrastructure.database.postgres.repositories import UserRepositoryImpl
from infrastructure.security import jwt_service as jwt
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
    db: AsyncSession = Depends(get_session),
    blacklist: TokenBlacklistService = Depends(get_blacklist_service),
    request: Request = None,
) -> AuthenticatedUser:
    """Extracts JWT from Authorization header (or ?token query param as fallback)
    and returns AuthenticatedUser.

    The ?token query param fallback is needed for the /file endpoint,
    which is accessed directly by the browser/PDF viewer via an <a> tag.
    """
    token: Optional[str] = None

    if credentials is not None:
        token = credentials.credentials
    elif request is not None:
        # Fallback: extract from ?token= query parameter
        token = request.query_params.get("token")

    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = jwt.decode_token(token)
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


