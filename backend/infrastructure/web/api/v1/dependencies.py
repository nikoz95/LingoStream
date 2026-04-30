from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from infrastructure.database.postgres.session import get_db
from infrastructure.database.postgres.user_repository_impl import UserRepositoryImpl
from infrastructure.security.jwt_service import JWTService
from domain.entities.user import User
from config.settings import settings


def get_current_user(db: Session = Depends(get_db)):
    # This would normally decode the JWT token and fetch the user
    # For now, we'll return a mock user for testing purposes
    # In a real implementation, this would:
    # 1. Extract token from Authorization header
    # 2. Decode JWT token
    # 3. Get user ID from token
    # 4. Fetch user from repository
    # 5. Return user object
    
    # Mock implementation for testing
    user_repo = UserRepositoryImpl(db)
    mock_user = User(
        id=1,
        email="test@example.com",
        hashed_password="hashed_password",
        created_at=None,
        updated_at=None
    )
    return mock_user