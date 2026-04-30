from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from infrastructure.web.api.v1.schemas.auth_schemas import RegisterRequest, LoginRequest, UserResponse, TokenResponse
from domain.usecases.auth.register_user import RegisterUser, RegisterUserRequest, UserAlreadyExistsError
from domain.usecases.auth.login_user import LoginUser, LoginUserRequest, InvalidCredentialsError
from infrastructure.database.postgres.session import get_db
from infrastructure.database.postgres.user_repository_impl import UserRepositoryImpl
from infrastructure.security.password_service import PasswordService
from infrastructure.security.jwt_service import JWTService
from infrastructure.web.api.v1.dependencies import get_current_user
from domain.entities.user import User


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse)
async def register(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):
    user_repo = UserRepositoryImpl(db)
    register_usecase = RegisterUser(user_repo)
    
    try:
        # Hash password before registering
        hashed_password, _ = PasswordService.hash_password(request.password)
        register_request = RegisterUserRequest(
            email=request.email,
            password=hashed_password
        )
        result = await register_usecase.execute(register_request)
        
        # Return user without password
        return UserResponse(
            id=result.id,
            email=result.email
        )
    except UserAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db)
):
    user_repo = UserRepositoryImpl(db)
    login_usecase = LoginUser(user_repo)
    
    try:
        login_request = LoginUserRequest(
            email=request.email,
            password=request.password
        )
        result = await login_usecase.execute(login_request)
        
        # In a real implementation, we would verify the password here
        # and generate a proper JWT token
        
        return TokenResponse(
            access_token=result.access_token,
            token_type=result.token_type
        )
    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    return current_user