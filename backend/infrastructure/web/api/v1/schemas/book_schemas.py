"""Pydantic schemas for book-related API endpoints."""
from typing import Any, Dict, Optional, List
from datetime import datetime

from pydantic import BaseModel


# ── Book schemas ────────────────────────────────────────────────────────


class BookSchema(BaseModel):
    """Base book fields shared by list, detail, and register responses."""
    id: int
    title: str
    author: str
    total_chapters: int
    language: str
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BookListItem(BookSchema):
    """Lightweight book representation for library list views."""
    pass


class RegisterBookResponse(BookSchema):
    """Response after uploading and registering a new book."""
    pass


class BookDetailResponse(BookSchema):
    """Full book detail with nested chapters."""
    file_path: str
    updated_at: Optional[datetime] = None
    chapters: List["ChapterResponse"] = []


# ── Chapter schemas ─────────────────────────────────────────────────────


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


# ── Translation schemas ─────────────────────────────────────────────────


class TranslatePassageRequest(BaseModel):
    """Request to translate a selected passage from a book chapter."""
    paragraph_indices: List[int]
    context_window: int = 2
    provider: Optional[str] = None


class TranslatePassageResponse(BaseModel):
    """Response containing the original passage and its translation."""
    passage: str
    translation: str
    provider: str


class TranslateTextRequest(BaseModel):
    """Request to translate arbitrary selected text from a book."""
    text: str
    language: Optional[str] = None
    provider: Optional[str] = None


class TranslateTextResponse(BaseModel):
    """Response containing the translation of arbitrary selected text."""
    source_text: str
    translated_text: str
    provider: str


class TranslateWordRequest(BaseModel):
    """Request to translate a single word with context."""
    word: str
    left_context: str = ""
    right_context: str = ""
    book_title: str = ""
    source_language: str = "en"
    provider: Optional[str] = None


class TranslateWordResponse(BaseModel):
    """Response for a single-word translation with phonetic + definition."""
    word: str
    translation: str
    phonetic: str = ""
    definition: str = ""
    sentence_context: str = ""
    sentence_context_translated: str = ""
    provider: str


# ── Vocabulary schemas ──────────────────────────────────────────────────


class VocabularyWordSchema(BaseModel):
    """A saved vocabulary word."""
    id: int
    word: str
    phonetic: Optional[str] = None
    definition: Optional[str] = None
    sentence_context: Optional[str] = None
    sentence_context_translated: Optional[str] = None
    translation: Optional[str] = None
    book_id: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CreateVocabularyWordRequest(BaseModel):
    """Request to save a vocabulary word."""
    book_id: Optional[int] = None
    word: str
    phonetic: Optional[str] = None
    definition: Optional[str] = None
    sentence_context: Optional[str] = None
    sentence_context_translated: Optional[str] = None
    translation: Optional[str] = None


class UpdateVocabularyWordRequest(BaseModel):
    """Request to update a vocabulary word (all fields optional - only provided fields are updated)."""
    word: Optional[str] = None
    phonetic: Optional[str] = None
    definition: Optional[str] = None
    sentence_context: Optional[str] = None
    sentence_context_translated: Optional[str] = None
    translation: Optional[str] = None
    book_id: Optional[int] = None


class VocabularyCheckResponse(BaseModel):
    """Response when checking if a word already exists in vocabulary."""
    exists: bool
    word: Optional[VocabularyWordSchema] = None


class VocabularyListResponse(BaseModel):
    """List of saved vocabulary words."""
    words: List[VocabularyWordSchema]
    total: int
