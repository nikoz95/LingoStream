from dataclasses import dataclass
from typing import Optional
from domain.entities.user import User
from domain.repositories.user_repository import UserRepository


class InvalidCredentialsError(Exception):
    """Raised when login credentials are invalid"""
    pass


@dataclass
class LoginUserRequest:
    email: str
    password: str


@dataclass
class LoginUserResponse:
    access_token: str
    token_type: str
    user: 'User'


class LoginUser:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    async def execute(self, request: LoginUserRequest) -> LoginUserResponse:
        # Find user by email
        user = await self.user_repository.get_by_email(request.email)
        if not user:
            raise InvalidCredentialsError("Invalid email or password")

        # Verify password (this should be handled by infrastructure)
        # For now, we assume the password is already verified in infrastructure
        # In a real implementation, we'd have a password service here
        
        # Generate JWT token (this would be handled by infrastructure)
        # For now, we'll return a mock token
        access_token = "mock_jwt_token"  # This will be generated in infrastructure
        
        return LoginUserResponse(
            access_token=access_token,
            token_type="bearer",
            user=user
        )