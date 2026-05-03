"""Authentication endpoints — register, login, refresh, logout, profile."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from infrastructure.web.api.v1.schemas.auth_schemas import (
    RegisterRequest,
    LoginRequest,
    UserResponse,
    TokenResponse,
    RefreshTokenRequest,
)
from infrastructure.database.postgres.session import get_db
from infrastructure.database.postgres.user_repository_impl import UserRepositoryImpl
from infrastructure.security import jwt_service as jwt
from infrastructure.security import password_service as pwd
from infrastructure.security.token_blacklist import TokenBlacklistService
from infrastructure.web.api.v1.dependencies import (
    get_current_user,
    authenticate_request,
    get_blacklist_service,
    AuthenticatedUser,
)
from domain.entities.user import User

router = APIRouter(tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user and return JWT tokens."""
    user_repo = UserRepositoryImpl(db)

    # Check if user already exists
    existing = await user_repo.get_by_email(request.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists",
        )

    # Create user
    hashed = pwd.hash_password(request.password)
    user = User(email=request.email, hashed_password=hashed)
    user = await user_repo.add(user)

    # Generate tokens
    access_token = jwt.create_access_token(data={"sub": str(user.id)})
    refresh_token = jwt.create_refresh_token(data={"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(id=user.id, email=user.email, created_at=user.created_at),
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login — returns JWT access + refresh tokens."""
    user_repo = UserRepositoryImpl(db)

    user = await user_repo.get_by_email(request.email)
    if user is None or not pwd.verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = jwt.create_access_token(data={"sub": str(user.id)})
    refresh_token = jwt.create_refresh_token(data={"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(id=user.id, email=user.email, created_at=user.created_at),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Refresh an expired access token using a valid refresh token."""
    payload = jwt.decode_token(request.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload",
        )

    user_repo = UserRepositoryImpl(db)
    user = await user_repo.get_by_id(int(user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    access_token = jwt.create_access_token(data={"sub": str(user.id)})
    new_refresh_token = jwt.create_refresh_token(data={"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=UserResponse(id=user.id, email=user.email, created_at=user.created_at),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get the currently authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        created_at=current_user.created_at,
    )


@router.post("/logout")
async def logout(
    auth: AuthenticatedUser = Depends(authenticate_request),
    blacklist: TokenBlacklistService = Depends(get_blacklist_service),
):
    """Logout — blacklist the current token so it can no longer be used."""
    jti = auth.payload.get("jti")
    exp = auth.payload.get("exp")
    if jti and exp:
        await blacklist.blacklist_token(jti, exp)
    return {"message": "Logged out successfully"}