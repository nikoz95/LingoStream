from abc import ABC, abstractmethod
from typing import Optional
from domain.entities.user import User


class UserRepository(ABC):
    @abstractmethod
    async def add(self, user: User) -> User:
        pass

    @abstractmethod
    async def get_by_email(self, email: str) -> Optional[User]:
        pass

    @abstractmethod
    async def get_by_id(self, user_id: int) -> Optional[User]:
        pass