"""SQLAlchemy async repository implementations for all domain entities."""
from typing import Optional, List

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from domain.entities.book import Book, Chapter, Paragraph
from domain.entities.user import User
from domain.repositories.book_repository import (
    BookRepository,
    ChapterRepository,
    ParagraphRepository,
)
from domain.repositories.user_repository import UserRepository
from infrastructure.database.postgres import models as orm


# ── ORM mapping helpers ──────────────────────────────────────────────────────


def _book_from_orm(b: orm.Book) -> Book:
    return Book(
        id=b.id,
        title=b.title,
        author=b.author,
        file_path=b.file_path,
        total_chapters=b.total_chapters,
        language=b.language,
        status=b.status,
        created_at=b.created_at,
        updated_at=b.updated_at,
    )


def _chapter_from_orm(ch: orm.Chapter) -> Chapter:
    return Chapter(
        id=ch.id,
        book_id=ch.book_id,
        title=ch.title,
        spine_index=ch.spine_index,
        sequence_start=ch.sequence_start,
        sequence_end=ch.sequence_end,
        paragraph_count=ch.paragraph_count,
        is_parsed=ch.is_parsed,
        created_at=ch.created_at,
    )


def _paragraph_from_orm(p: orm.Paragraph) -> Paragraph:
    return Paragraph(
        id=p.id,
        book_id=p.book_id,
        chapter_id=p.chapter_id,
        content=p.content,
        index=p.index,
        phonetic_transcription=p.phonetic_transcription,
    )


def _user_from_orm(u: orm.User) -> User:
    return User(
        id=u.id,
        email=u.email,
        hashed_password=u.hashed_password,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


# ── Book Repository ──────────────────────────────────────────────────────────


class BookRepositoryImpl(BookRepository):
    """CRUD for Book entities."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def add_book(self, book: Book) -> Book:
        book_orm = orm.Book(
            title=book.title,
            author=book.author,
            file_path=book.file_path,
            total_chapters=book.total_chapters,
            language=book.language,
            status=book.status,
        )
        self.db.add(book_orm)
        await self.db.commit()
        await self.db.refresh(book_orm)
        return _book_from_orm(book_orm)

    async def get_book_by_id(self, book_id: int) -> Optional[Book]:
        result = await self.db.execute(select(orm.Book).where(orm.Book.id == book_id))
        book_orm = result.scalar_one_or_none()
        return _book_from_orm(book_orm) if book_orm else None

    async def get_books_by_user(self, user_id: int) -> List[Book]:
        result = await self.db.execute(
            select(orm.Book).order_by(orm.Book.created_at.desc())
        )
        return [_book_from_orm(b) for b in result.scalars().all()]

    async def update_book_status(self, book_id: int, status: str) -> None:
        await self.db.execute(
            update(orm.Book).where(orm.Book.id == book_id).values(status=status)
        )
        await self.db.commit()

    async def delete_book(self, book_id: int) -> Optional[str]:
        result = await self.db.execute(
            select(orm.Book).where(orm.Book.id == book_id)
        )
        book_orm = result.scalar_one_or_none()
        if book_orm is None:
            return None
        file_path = book_orm.file_path
        await self.db.execute(delete(orm.Book).where(orm.Book.id == book_id))
        await self.db.commit()
        return file_path


# ── Chapter Repository ───────────────────────────────────────────────────────


class ChapterRepositoryImpl(ChapterRepository):
    """CRUD for Chapter entities."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def add_chapters(self, chapters: List[Chapter]) -> List[Chapter]:
        orm_chapters = []
        for ch in chapters:
            ch_orm = orm.Chapter(
                book_id=ch.book_id,
                title=ch.title,
                spine_index=ch.spine_index,
            )
            self.db.add(ch_orm)
            orm_chapters.append(ch_orm)
        await self.db.commit()

        result = []
        for ch_orm in orm_chapters:
            await self.db.refresh(ch_orm)
            result.append(_chapter_from_orm(ch_orm))
        return result

    async def get_chapters_by_book(self, book_id: int) -> List[Chapter]:
        result = await self.db.execute(
            select(orm.Chapter)
            .where(orm.Chapter.book_id == book_id)
            .order_by(orm.Chapter.spine_index)
        )
        return [_chapter_from_orm(ch) for ch in result.scalars().all()]

    async def get_chapter_by_id(self, chapter_id: int) -> Optional[Chapter]:
        result = await self.db.execute(
            select(orm.Chapter).where(orm.Chapter.id == chapter_id)
        )
        ch = result.scalar_one_or_none()
        return _chapter_from_orm(ch) if ch else None

    async def mark_chapter_parsed(
        self, chapter_id: int, seq_start: int, seq_end: int, count: int
    ) -> None:
        await self.db.execute(
            update(orm.Chapter)
            .where(orm.Chapter.id == chapter_id)
            .values(
                sequence_start=seq_start,
                sequence_end=seq_end,
                paragraph_count=count,
                is_parsed=True,
            )
        )
        await self.db.commit()


# ── Paragraph Repository ─────────────────────────────────────────────────────


class ParagraphRepositoryImpl(ParagraphRepository):
    """CRUD for Paragraph entities."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def add_paragraphs(self, paragraphs: List[Paragraph]) -> None:
        for p in paragraphs:
            self.db.add(
                orm.Paragraph(
                    book_id=p.book_id,
                    chapter_id=p.chapter_id,
                    content=p.content,
                    index=p.index,
                )
            )
        await self.db.commit()

    async def get_paragraphs_by_chapter(self, chapter_id: int) -> List[Paragraph]:
        result = await self.db.execute(
            select(orm.Paragraph)
            .where(orm.Paragraph.chapter_id == chapter_id)
            .order_by(orm.Paragraph.index)
        )
        return [_paragraph_from_orm(p) for p in result.scalars().all()]


# ── User Repository ──────────────────────────────────────────────────────────


class UserRepositoryImpl(UserRepository):
    """CRUD for User entities."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def add(self, user: User) -> User:
        user_orm = orm.User(email=user.email, hashed_password=user.hashed_password)
        self.db.add(user_orm)
        await self.db.commit()
        await self.db.refresh(user_orm)
        return _user_from_orm(user_orm)

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(
            select(orm.User).where(orm.User.email == email)
        )
        user_orm = result.scalar_one_or_none()
        return _user_from_orm(user_orm) if user_orm else None

    async def get_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db.execute(
            select(orm.User).where(orm.User.id == user_id)
        )
        user_orm = result.scalar_one_or_none()
        return _user_from_orm(user_orm) if user_orm else None