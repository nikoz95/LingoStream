from dataclasses import dataclass
from typing import Optional
from domain.entities.user import User
from domain.repositories.user_repository import UserRepository


class UserAlreadyExistsError(Exception):
    """Raised when trying to register a user with an email that already exists"""
    pass


@dataclass
class RegisterUserRequest:
    email: str
    password: str


@dataclass
class RegisterUserResponse:
    id: int
    email: str
    created_at: Optional[object] = None


class RegisterUser:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    async def execute(self, request: RegisterUserRequest) -> RegisterUserResponse:
        # Check if user already exists
        existing_user = await self.user_repository.get_by_email(request.email)
        if existing_user:
            raise UserAlreadyExistsError("User with this email already exists")

        # Create new user (password hashing should be done in infrastructure layer)
        user = User(
            email=request.email,
            hashed_password=request.password,  # This will be hashed in infrastructure
            created_at=None,
            updated_at=None
        )

        saved_user = await self.user_repository.add(user)
        
        return RegisterUserResponse(
            id=saved_user.id,
            email=saved_user.email,
            created_at=saved_user.created_at,
        )
