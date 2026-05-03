"""SQLAlchemy async implementation of UserRepository."""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.entities.user import User
from domain.repositories.user_repository import UserRepository
from infrastructure.database.postgres import models as orm


def _user_from_orm(u: orm.User) -> User:
    return User(
        id=u.id, email=u.email,
        hashed_password=u.hashed_password,
        created_at=u.created_at, updated_at=u.updated_at,
    )


class UserRepositoryImpl(UserRepository):
    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def add(self, user: User) -> User:
        user_orm = orm.User(email=user.email, hashed_password=user.hashed_password)
        self.db.add(user_orm)
        await self.db.commit()
        await self.db.refresh(user_orm)
        return _user_from_orm(user_orm)

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(select(orm.User).where(orm.User.email == email))
        user_orm = result.scalar_one_or_none()
        return _user_from_orm(user_orm) if user_orm else None

    async def get_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db.execute(select(orm.User).where(orm.User.id == user_id))
        user_orm = result.scalar_one_or_none()
        return _user_from_orm(user_orm) if user_orm else None