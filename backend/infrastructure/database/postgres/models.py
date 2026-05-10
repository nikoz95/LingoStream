"""SQLAlchemy ORM models for LingoStream.

All models inherit from the canonical ``Base`` defined in ``session.py``.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text

from infrastructure.database.postgres.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(500), nullable=False)
    author = Column(String(300), default="Unknown Author")
    language = Column(String(10), default="en")
    file_path = Column(String(1000), nullable=False)
    total_chapters = Column(Integer, default=0)
    total_pages = Column(Integer, default=0)
    status = Column(String(20), default="indexed")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    title = Column(String(500), nullable=False)
    spine_index = Column(Integer, default=0)
    sequence_start = Column(Integer, default=0)
    sequence_end = Column(Integer, default=0)
    paragraph_count = Column(Integer, default=0)
    is_parsed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Paragraph(Base):
    __tablename__ = "paragraphs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    content = Column(Text, nullable=False)
    index = Column(Integer, nullable=False)
    page_index = Column(Integer, nullable=True)
    bbox_x0 = Column(Float, nullable=True)
    bbox_y0 = Column(Float, nullable=True)
    bbox_x1 = Column(Float, nullable=True)
    bbox_y1 = Column(Float, nullable=True)
    phonetic_transcription = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class WordPosition(Base):
    """Word-level bounding box positions for PDF pages.

    Extracted by PyMuPDF during lazy parsing. Each row = one word on one page,
    with its exact bounding box in PDF points coordinate space.
    """
    __tablename__ = "word_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False, index=True)
    page_index = Column(Integer, nullable=False)
    word = Column(String(500), nullable=False)
    x0 = Column(Float, nullable=False)
    y0 = Column(Float, nullable=False)
    x1 = Column(Float, nullable=False)
    y1 = Column(Float, nullable=False)
    word_index = Column(Integer, default=0)
    line_index = Column(Integer, default=0)
    block_index = Column(Integer, default=0)


class TranslationRecord(Base):
    __tablename__ = "translation_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    paragraph_id = Column(Integer, ForeignKey("paragraphs.id"), nullable=False)
    source_text = Column(Text, nullable=False)
    translated_text = Column(Text, nullable=False)
    provider = Column(String(50), default="openai")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class VocabularyWord(Base):
    """Saved vocabulary words for a user."""
    __tablename__ = "vocabulary_words"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=True)
    word = Column(String(500), nullable=False)
    phonetic = Column(String(500), nullable=True)
    definition = Column(Text, nullable=True)
    sentence_context = Column(Text, nullable=True)
    sentence_context_translated = Column(Text, nullable=True)
    translation = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))