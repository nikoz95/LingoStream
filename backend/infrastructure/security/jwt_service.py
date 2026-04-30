import jwt
from datetime import datetime, timedelta
from typing import Dict, Any
from config.settings import settings


class JWTService:
    """Service for creating and decoding JWT tokens"""
    
    @staticmethod
    def create_token(payload: Dict[str, Any]) -> str:
        """
        Create a JWT token
        """
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        payload.update({"exp": expire})
        token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        return token
    
    @staticmethod
    def decode_token(token: str) -> Dict[str, Any]:
        """
        Decode a JWT token
        """
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload