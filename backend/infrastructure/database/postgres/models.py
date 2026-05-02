from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean, BigInteger
from datetime import datetime
from infrastructure.database.postgres.session import Base
from sqlalchemy.orm import relationship


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    author = Column(String, default="Unknown")
    file_path = Column(String, nullable=False)
    total_chapters = Column(Integer, default=0)
    language = Column(String, default="en")
    status = Column(String, default="indexed")  # indexed, parsing, ready, error
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    chapters = relationship("Chapter", back_populates="book", cascade="all, delete-orphan")
    paragraphs = relationship("Paragraph", back_populates="book", cascade="all, delete-orphan")


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    spine_index = Column(Integer, nullable=False)  # order in EPUB spine
    sequence_start = Column(Integer, default=0)    # first paragraph index in book
    sequence_end = Column(Integer, default=0)      # last paragraph index in book
    paragraph_count = Column(Integer, default=0)
    is_parsed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    book = relationship("Book", back_populates="chapters")
    paragraphs = relationship("Paragraph", back_populates="chapter", cascade="all, delete-orphan")


class Paragraph(Base):
    __tablename__ = "paragraphs"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    index = Column(Integer, nullable=False)  # global sequence index in book
    phonetic_transcription = Column(String, nullable=True)

    # Composite index for O(1) paragraph fetching
    __table_args__ = (
        {"sqlite_autoincrement": True},  # not needed for pg, but harmless
    )

    # Relationships
    book = relationship("Book", back_populates="paragraphs")
    chapter = relationship("Chapter", back_populates="paragraphs")