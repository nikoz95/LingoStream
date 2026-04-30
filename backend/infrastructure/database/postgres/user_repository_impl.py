from typing import Optional
from sqlalchemy.orm import Session
from domain.entities.user import User
from domain.repositories.user_repository import UserRepository
from infrastructure.database.postgres.models import User as UserDB


class UserRepositoryImpl(UserRepository):
    def __init__(self, db_session: Session):
        self.db_session = db_session

    async def add(self, user: User) -> User:
        user_db = UserDB(
            email=user.email,
            hashed_password=user.hashed_password,
            created_at=user.created_at,
            updated_at=user.updated_at
        )
        self.db_session.add(user_db)
        self.db_session.commit()
        self.db_session.refresh(user_db)
        
        return User(
            id=user_db.id,
            email=user_db.email,
            hashed_password=user_db.hashed_password,
            created_at=user_db.created_at,
            updated_at=user_db.updated_at
        )

    async def get_by_email(self, email: str) -> Optional[User]:
        user_db = self.db_session.query(UserDB).filter(UserDB.email == email).first()
        if user_db:
            return User(
                id=user_db.id,
                email=user_db.email,
                hashed_password=user_db.hashed_password,
                created_at=user_db.created_at,
                updated_at=user_db.updated_at
            )
        return None

    async def get_by_id(self, user_id: int) -> Optional[User]:
        user_db = self.db_session.query(UserDB).filter(UserDB.id == user_id).first()
        if user_db:
            return User(
                id=user_db.id,
                email=user_db.email,
                hashed_password=user_db.hashed_password,
                created_at=user_db.created_at,
                updated_at=user_db.updated_at
            )
        return None