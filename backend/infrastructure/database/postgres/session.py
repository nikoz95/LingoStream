
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config.settings import settings


# For sync PostgreSQL connection, use psycopg2-binary instead of asyncpg
# If you want to use async, you need to change the whole architecture
engine = create_engine(
    settings.DB_URL,
    # Add pool settings to avoid connection issues
    pool_pre_ping=True,
    pool_recycle=3600
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

