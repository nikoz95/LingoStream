from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List


@dataclass
class Book:
    id: Optional[int] = None
    title: str = ""
    author: str = ""
    file_path: str = ""
    total_chapters: int = 0
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
    phonetic_transcription: Optional[str] = None