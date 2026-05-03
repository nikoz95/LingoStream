"""Auth routes: register, login, refresh, me, logout."""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from domain.entities.user import User
from infrastructure.database.postgres.session import get_session
from infrastructure.database.postgres.repositories import UserRepositoryImpl
from infrastructure.security.jwt_service import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from infrastructure.security.password_service import hash_password, verify_password
from infrastructure.security.token_blacklist import TokenBlacklistService
from infrastructure.web.api.v1.dependencies import (
    authenticate_request,
    get_current_user,
    get_blacklist_service,
    AuthenticatedUser,
)
from infrastructure.web.api.v1.schemas.auth_schemas import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    RefreshTokenRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _build_token_response(user: User) -> TokenResponse:
    """Create access + refresh tokens and return them with user info."""
    token_data = {"sub": str(user.id), "email": user.email}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(id=user.id, email=user.email, created_at=user.created_at),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_session)):
    repo = UserRepositoryImpl(db)
    existing = await repo.get_by_email(request.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = User(
        email=request.email,
        hashed_password=hash_password(request.password),
    )
    created = await repo.add(user)
    logger.info("User registered: id=%d email=%s", created.id, created.email)
    return _build_token_response(created)


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_session)):
    repo = UserRepositoryImpl(db)
    user = await repo.get_by_email(request.email)
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    logger.info("User logged in: id=%d email=%s", user.id, user.email)
    return _build_token_response(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_session),
    blacklist_service: TokenBlacklistService = Depends(get_blacklist_service),
):
    payload = decode_token(request.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    jti = payload.get("jti")
    exp = payload.get("exp", 0)
    if jti and await blacklist_service.is_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )
    # Blacklist the old refresh token (prevent replay)
    if jti:
        await blacklist_service.blacklist_token(jti, exp)

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    repo = UserRepositoryImpl(db)
    user = await repo.get_by_id(int(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _build_token_response(user)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        created_at=current_user.created_at,
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    auth: AuthenticatedUser = Depends(authenticate_request),
    blacklist_service: TokenBlacklistService = Depends(get_blacklist_service),
):
    """Blacklist the current access token so it can no longer be used."""
    jti = auth.payload.get("jti")
    exp = auth.payload.get("exp", 0)
    if jti:
        await blacklist_service.blacklist_token(jti, exp)
        logger.info("Token blacklisted: jti=%s user_id=%d", jti, auth.user.id)
    return {"message": "Successfully logged out"}
