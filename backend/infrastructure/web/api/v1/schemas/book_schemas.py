from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class RegisterBookRequest(BaseModel):
    file_path: str


class RegisterBookResponse(BaseModel):
    id: int
    title: str
    author: str
    total_chapters: int
    language: str
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ChapterResponse(BaseModel):
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


class BookListItem(BaseModel):
    id: int
    title: str
    author: str
    total_chapters: int
    language: str
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ParagraphResponse(BaseModel):
    id: int
    book_id: int
    chapter_id: int
    content: str
    index: int
    phonetic_transcription: Optional[str] = None

    model_config = {"from_attributes": True}


class ChapterParagraphsResponse(BaseModel):
    chapter: ChapterResponse
    paragraphs: List[ParagraphResponse]


class TranslatePassageRequest(BaseModel):
    """Request to translate a selected passage from a book chapter."""
    selected_indices: List[int]           # list of paragraph indices to translate
    left_context_count: int = 1           # how many paragraphs before to include as context
    right_context_count: int = 1          # how many paragraphs after to include as context
    source_language: str = "en"           # source language code


class TranslatePassageResponse(BaseModel):
    """Response containing the original passage and its Georgian translation."""
    original: str                         # concatenated original passage
    translation: str                      # Georgian translation
    left_context: str = ""                # preceding context (for reference)
    right_context: str = ""               # following context (for reference)


class TranslateTextRequest(BaseModel):
    """Request to translate arbitrary selected text with surrounding context."""
    selected_text: str                    # the text the user selected with the mouse
    left_context: str = ""                # text before the selection (up to ~500 chars)
    right_context: str = ""               # text after the selection (up to ~500 chars)
    book_title: str = ""                  # book title for LLM context
    source_language: str = "en"           # source language


class TranslateTextResponse(BaseModel):
    """Response containing the translation of arbitrary selected text."""
    original: str
    translation: str