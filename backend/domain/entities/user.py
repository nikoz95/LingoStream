"""User domain entity."""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class User:
    """Domain entity representing an application user."""
    id: Optional[int] = None
    email: str = ""
    hashed_password: str = ""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None