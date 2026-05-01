from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
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
    title = Column(String, index=True)
    author = Column(String)
    file_path = Column(String)  # Store EPUB file path
    
    # Relationship with paragraphs
    paragraphs = relationship("Paragraph", back_populates="book")


class Paragraph(Base):
    __tablename__ = "paragraphs"
    
    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"))
    content = Column(Text)
    index = Column(Integer)
    phonetic_transcription = Column(String)  # For phonetic transcriptions
    
    # Relationship with book
    book = relationship("Book", back_populates="paragraphs")
