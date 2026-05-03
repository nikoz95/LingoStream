"""Pydantic schemas for book-related API endpoints."""
from typing import Optional, List
from datetime import datetime

from pydantic import BaseModel


class BookListItem(BaseModel):
    """Lightweight book representation for list views."""
    id: int
    title: str
    author: str
    total_chapters: int
    language: str
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RegisterBookResponse(BaseModel):
    """Response after uploading and registering a new book."""
    id: int
    title: str
    author: str
    total_chapters: int
    language: str
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ChapterResponse(BaseModel):
    """A single chapter within a book."""
    id: int
    book_id: int
    title: str
    spine_index: int
    sequence_start: int
    sequence_end: int
    paragraph_count: int
    is_parsed: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BookDetailResponse(BaseModel):
    """Full book detail with chapters."""
    id: int
    title: str
    author: str
    file_path: str
    total_chapters: int
    language: str
    status: str
    chapters: List[ChapterResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ParagraphResponse(BaseModel):
    """A single paragraph within a chapter."""
    id: int
    book_id: int
    chapter_id: int
    content: str
    index: int
    phonetic_transcription: Optional[str] = None

    model_config = {"from_attributes": True}


class ChapterParagraphsResponse(BaseModel):
    """A chapter with all its paragraphs."""
    chapter: ChapterResponse
    paragraphs: List[ParagraphResponse]


class TranslatePassageRequest(BaseModel):
    """Request to translate a selected passage from a book chapter."""
    selected_indices: List[int]
    left_context_count: int = 1
    right_context_count: int = 1
    source_language: str = "en"
    provider: Optional[str] = None


class TranslatePassageResponse(BaseModel):
    """Response containing the original passage and its Georgian translation."""
    original: str
    translation: str
    left_context: str = ""
    right_context: str = ""


class TranslateTextRequest(BaseModel):
    """Request to translate arbitrary selected text with surrounding context."""
    selected_text: str
    left_context: str = ""
    right_context: str = ""
    book_title: str = ""
    source_language: str = "en"
    provider: Optional[str] = None


class TranslateTextResponse(BaseModel):
    """Response containing the translation of arbitrary selected text."""
    original: str
    translation: str