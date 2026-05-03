"""Database session management and declarative Base (async SQLAlchemy).

Canonical location for the ORM ``Base`` — all models import from here
so that :func:`Base.metadata.create_all` discovers every model.
"""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from config.settings import settings


engine = create_async_engine(
    settings.db_url,
    pool_pre_ping=True,
    pool_recycle=3600,
)

async_session_factory = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models — do NOT define another ``Base`` anywhere."""


async def get_session() -> AsyncSession:  # type: ignore[misc]
    """FastAPI dependency — yields an async DB session and closes it on teardown."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()