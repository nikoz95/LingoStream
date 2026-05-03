from abc import ABC, abstractmethod
from typing import Optional, List
from domain.entities.book import Book, Chapter, Paragraph


class BookRepository(ABC):
    """Repository interface for Book aggregate."""

    @abstractmethod
    async def add_book(self, book: Book) -> Book:
        ...

    @abstractmethod
    async def get_book_by_id(self, book_id: int) -> Optional[Book]:
        ...

    @abstractmethod
    async def get_books_by_user(self, user_id: int) -> List[Book]:
        ...

    @abstractmethod
    async def update_book_status(self, book_id: int, status: str) -> None:
        ...

    @abstractmethod
    async def delete_book(self, book_id: int) -> Optional[str]:
        ...


class ChapterRepository(ABC):
    """Repository interface for Chapter aggregate."""

    @abstractmethod
    async def add_chapters(self, chapters: List[Chapter]) -> List[Chapter]:
        ...

    @abstractmethod
    async def get_chapters_by_book(self, book_id: int) -> List[Chapter]:
        ...

    @abstractmethod
    async def get_chapter_by_id(self, chapter_id: int) -> Optional[Chapter]:
        ...

    @abstractmethod
    async def mark_chapter_parsed(self, chapter_id: int, seq_start: int, seq_end: int, count: int) -> None:
        ...


class ParagraphRepository(ABC):
    """Repository interface for Paragraph aggregate."""

    @abstractmethod
    async def add_paragraphs(self, paragraphs: List[Paragraph]) -> None:
        ...

    @abstractmethod
    async def get_paragraphs_by_chapter(self, chapter_id: int) -> List[Paragraph]:
        ...
