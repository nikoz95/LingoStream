from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from infrastructure.web.api.v1.schemas.auth_schemas import (
    RegisterRequest,
    LoginRequest,
    UserResponse,
    TokenResponse,
    RefreshTokenRequest,
)
from domain.usecases.auth.register_user import (
    RegisterUser,
    RegisterUserRequest,
    UserAlreadyExistsError,
)
from domain.usecases.auth.login_user import (
    LoginUser,
    LoginUserRequest,
    InvalidCredentialsError,
)
from infrastructure.database.postgres.session import get_db
from infrastructure.database.postgres.user_repository_impl import UserRepositoryImpl
from infrastructure.security.password_service import PasswordService
from infrastructure.security.jwt_service import JWTService
from infrastructure.web.api.v1.dependencies import (
    get_current_user,
    get_current_user_optional,
    authenticate_request,
    get_blacklist_service,
    AuthenticatedUser,
    TokenBlacklistService,
)
from domain.entities.user import User


router = APIRouter(tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user and return JWT tokens"""
    user_repo = UserRepositoryImpl(db)
    register_usecase = RegisterUser(user_repo)
    
    # Hash the password BEFORE passing to usecase
    hashed_password = PasswordService.hash_password(request.password)
    register_request = RegisterUserRequest(
        email=request.email,
        password=hashed_password,
    )

    try:
        result = await register_usecase.execute(register_request)
        
        # Generate tokens (same as login)
        access_token = JWTService.create_access_token(data={"sub": str(result.id)})
        refresh_token = JWTService.create_refresh_token(data={"sub": str(result.id)})

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserResponse(
                id=result.id,
                email=result.email,
                created_at=result.created_at,
            ),
        )
    except UserAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists",
        )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login — returns JWT access + refresh tokens"""
    user_repo = UserRepositoryImpl(db)
    login_usecase = LoginUser(user_repo, PasswordService.verify_password)

    login_request = LoginUserRequest(email=request.email, password=request.password)

    try:
        result = await login_usecase.execute(login_request)
        
        # Generate tokens
        access_token = JWTService.create_access_token(data={"sub": str(result.id)})
        refresh_token = JWTService.create_refresh_token(data={"sub": str(result.id)})

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserResponse(
                id=result.id,
                email=result.email,
                created_at=result.created_at,
            ),
        )
    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Refresh an expired access token using a valid refresh token"""
    payload = JWTService.decode_token(request.refresh_token)
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

    # Issue new tokens
    access_token = JWTService.create_access_token(data={"sub": str(user.id)})
    new_refresh_token = JWTService.create_refresh_token(data={"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            created_at=user.created_at,
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """Get the currently authenticated user's profile"""
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
    """Logout — blacklist the current token so it can no longer be used"""
    jti = auth.payload.get("jti")
    exp = auth.payload.get("exp")
    if jti and exp:
        await blacklist.blacklist_token(jti, exp)
    return {"message": "Logged out successfully"}
