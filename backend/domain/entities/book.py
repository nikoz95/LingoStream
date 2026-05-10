from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Book:
    id: Optional[int] = None
    user_id: int = 0
    title: str = ""
    author: str = ""
    file_path: str = ""
    total_chapters: int = 0
    total_pages: int = 0
    language: str = "en"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    status: str = "indexed"  # indexed, parsing, ready, error


@dataclass
class Chapter:
    id: Optional[int] = None
    book_id: int = 0
    title: str = ""
    spine_index: int = 0
    sequence_start: int = 0
    sequence_end: int = 0
    paragraph_count: int = 0
    is_parsed: bool = False
    created_at: Optional[datetime] = None


@dataclass
class Paragraph:
    id: Optional[int] = None
    book_id: int = 0
    chapter_id: int = 0
    content: str = ""
    index: int = 0
    page_index: Optional[int] = None
    bbox_x0: Optional[float] = None
    bbox_y0: Optional[float] = None
    bbox_x1: Optional[float] = None
    bbox_y1: Optional[float] = None
    phonetic_transcription: Optional[str] = None


@dataclass
class PageImage:
    """Rendered page image record for server-side rendered PDF pages."""
    id: Optional[int] = None
    book_id: int = 0
    page_index: int = 0
    image_path: str = ""
    thumb_path: str = ""
    width: int = 0
    height: int = 0
    dpi: int = 150
    created_at: Optional[datetime] = None