from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from domain.entities.user import User
from domain.repositories.user_repository import UserRepository
from infrastructure.database.postgres.models import User as UserDB


class UserRepositoryImpl(UserRepository):
    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session

    async def add(self, user: User) -> User:
        user_db = UserDB(
            email=user.email,
            hashed_password=user.hashed_password,
        )
        self.db_session.add(user_db)
        await self.db_session.commit()
        await self.db_session.refresh(user_db)

        return User(
            id=user_db.id,
            email=user_db.email,
            hashed_password=user_db.hashed_password,
            created_at=user_db.created_at,
            updated_at=user_db.updated_at,
        )

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db_session.execute(
            select(UserDB).where(UserDB.email == email)
        )
        user_db = result.scalar_one_or_none()
        if user_db:
            return User(
                id=user_db.id,
                email=user_db.email,
                hashed_password=user_db.hashed_password,
                created_at=user_db.created_at,
                updated_at=user_db.updated_at,
            )
        return None

    async def get_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db_session.execute(
            select(UserDB).where(UserDB.id == user_id)
        )
        user_db = result.scalar_one_or_none()
        if user_db:
            return User(
                id=user_db.id,
                email=user_db.email,
                hashed_password=user_db.hashed_password,
                created_at=user_db.created_at,
                updated_at=user_db.updated_at,
            )
        return None
