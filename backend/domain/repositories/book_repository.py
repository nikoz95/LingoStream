from abc import ABC, abstractmethod
from typing import Optional, List
from domain.entities.book import Book, Chapter, Paragraph


class BookRepository(ABC):
    """Repository interface for Book aggregate."""

    @abstractmethod
    async def add_book(self, book: Book) -> Book:
        """Register a new book."""
        ...

    @abstractmethod
    async def get_book_by_id(self, book_id: int) -> Optional[Book]:
        """Get book by ID."""
        ...

    @abstractmethod
    async def get_books_by_user(self, user_id: int) -> List[Book]:
        """Get all books for a user."""
        ...

    @abstractmethod
    async def update_book_status(self, book_id: int, status: str) -> None:
        """Update book processing status."""
        ...

    @abstractmethod
    async def delete_book(self, book_id: int) -> None:
        """Delete a book and all its chapters/paragraphs."""
        ...


class ChapterRepository(ABC):
    """Repository interface for Chapter aggregate."""

    @abstractmethod
    async def add_chapters(self, chapters: List[Chapter]) -> List[Chapter]:
        """Bulk insert chapters for a book."""
        ...

    @abstractmethod
    async def get_chapters_by_book(self, book_id: int) -> List[Chapter]:
        """Get all chapters for a book (lightweight, no paragraphs)."""
        ...

    @abstractmethod
    async def get_chapter_by_id(self, chapter_id: int) -> Optional[Chapter]:
        """Get a single chapter."""
        ...

    @abstractmethod
    async def mark_chapter_parsed(self, chapter_id: int, seq_start: int, seq_end: int, count: int) -> None:
        """Mark chapter as parsed with sequence bounds."""
        ...

    @abstractmethod
    async def get_next_unparsed_chapter(self, book_id: int) -> Optional[Chapter]:
        """Get the first chapter that hasn't been parsed yet (for background pre-caching)."""
        ...


class ParagraphRepository(ABC):
    """Repository interface for Paragraph aggregate."""

    @abstractmethod
    async def add_paragraphs(self, paragraphs: List[Paragraph]) -> None:
        """Bulk insert paragraphs."""
        ...

    @abstractmethod
    async def get_paragraphs_by_chapter(self, chapter_id: int) -> List[Paragraph]:
        """Get all paragraphs for a chapter, ordered by index."""
        ...

    @abstractmethod
    async def get_paragraph_by_id(self, paragraph_id: int) -> Optional[Paragraph]:
        """Get a single paragraph."""
        ...

    @abstractmethod
    async def get_paragraphs_by_book_batch(self, book_id: int, offset: int, limit: int) -> List[Paragraph]:
        """Get a batch of paragraphs by offset (for virtual scrolling)."""
        ...

    @abstractmethod
    async def count_paragraphs_by_book(self, book_id: int) -> int:
        """Total paragraph count for a book."""
        ...