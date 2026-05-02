from dataclasses import dataclass
from typing import Optional, Callable
from domain.entities.user import User
from domain.repositories.user_repository import UserRepository


class InvalidCredentialsError(Exception):
    pass


@dataclass
class LoginUserRequest:
    email: str
    password: str


@dataclass
class LoginUserResponse:
    id: int
    email: str
    created_at: Optional[object] = None


class LoginUser:
    def __init__(self, user_repository: UserRepository, password_verifier: Callable[[str, str], bool]):
        self.user_repository = user_repository
        self._verify = password_verifier

    async def execute(self, request: LoginUserRequest) -> LoginUserResponse:
        user = await self.user_repository.get_by_email(request.email)
        if not user:
            raise InvalidCredentialsError("Invalid email or password")

        if not self._verify(request.password, user.hashed_password):
            raise InvalidCredentialsError("Invalid email or password")

        return LoginUserResponse(
            id=user.id,
            email=user.email,
            created_at=user.created_at,
        )
