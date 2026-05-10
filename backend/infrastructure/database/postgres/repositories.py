"""SQLAlchemy async repository implementations for all domain entities.

Each repository inherits from ``BaseRepositoryImpl`` (which holds the DB session)
and implements the corresponding domain repository ABC.
"""
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

# ── ORM → Entity helpers ──────────────────────────────────────────────────


def _book_from_orm(b: orm.Book) -> Book:
    return Book(
        id=b.id,
        user_id=b.user_id,
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
        page_index=p.page_index,
        bbox_x0=p.bbox_x0,
        bbox_y0=p.bbox_y0,
        bbox_x1=p.bbox_x1,
        bbox_y1=p.bbox_y1,
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


# ── Base ──────────────────────────────────────────────────────────────────


class BaseRepositoryImpl:
    """Holds the async DB session for all repository implementations."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db


# ── Book ──────────────────────────────────────────────────────────────────


class BookRepositoryImpl(BaseRepositoryImpl, BookRepository):

    async def add_book(self, book: Book) -> Book:
        book_orm = orm.Book(
            user_id=book.user_id,
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
            select(orm.Book)
            .where(orm.Book.user_id == user_id)
            .order_by(orm.Book.created_at.desc())
        )
        return [_book_from_orm(b) for b in result.scalars().all()]

    async def update_book_status(self, book_id: int, status: str) -> None:
        await self.db.execute(
            update(orm.Book).where(orm.Book.id == book_id).values(status=status)
        )
        await self.db.commit()

    async def delete_book(self, book_id: int) -> Optional[str]:
        result = await self.db.execute(select(orm.Book).where(orm.Book.id == book_id))
        book_orm = result.scalar_one_or_none()
        if book_orm is None:
            return None
        file_path = book_orm.file_path

        # Cascade delete: children first, then nullify vocab references, then delete book
        # 1. Delete word positions for this book
        await self.db.execute(
            delete(orm.WordPosition).where(orm.WordPosition.book_id == book_id)
        )
        # 2. Delete translation records for paragraphs in this book
        await self.db.execute(
            delete(orm.TranslationRecord).where(
                orm.TranslationRecord.paragraph_id.in_(
                    select(orm.Paragraph.id).where(orm.Paragraph.book_id == book_id)
                )
            )
        )
        # 3. Delete paragraphs
        await self.db.execute(delete(orm.Paragraph).where(orm.Paragraph.book_id == book_id))
        # 4. Delete chapters
        await self.db.execute(delete(orm.Chapter).where(orm.Chapter.book_id == book_id))
        # 5. Nullify vocabulary word book references
        await self.db.execute(
            update(orm.VocabularyWord).where(orm.VocabularyWord.book_id == book_id).values(book_id=None)
        )
        # 6. Delete the book itself
        await self.db.execute(delete(orm.Book).where(orm.Book.id == book_id))
        await self.db.commit()
        return file_path


# ── Chapter ───────────────────────────────────────────────────────────────


class ChapterRepositoryImpl(BaseRepositoryImpl, ChapterRepository):

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


# ── Paragraph ─────────────────────────────────────────────────────────────


class ParagraphRepositoryImpl(BaseRepositoryImpl, ParagraphRepository):

    async def add_paragraphs(self, paragraphs: List[Paragraph]) -> None:
        for p in paragraphs:
            self.db.add(
                orm.Paragraph(
                    book_id=p.book_id,
                    chapter_id=p.chapter_id,
                    content=p.content,
                    index=p.index,
                    page_index=p.page_index,
                    bbox_x0=p.bbox_x0,
                    bbox_y0=p.bbox_y0,
                    bbox_x1=p.bbox_x1,
                    bbox_y1=p.bbox_y1,
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

    async def get_paragraphs_by_page(self, book_id: int, page_index: int) -> List[Paragraph]:
        """Get all paragraphs for a specific page index across any chapter."""
        result = await self.db.execute(
            select(orm.Paragraph)
            .where(orm.Paragraph.book_id == book_id)
            .where(orm.Paragraph.page_index == page_index)
            .order_by(orm.Paragraph.index)
        )
        return [_paragraph_from_orm(p) for p in result.scalars().all()]

    async def search_paragraphs(
        self, book_id: int, query: str
    ) -> List[dict]:
        """
        Full-text search across paragraphs for a book.

        Returns list of { paragraph_id, book_id, chapter_id, page_index,
                          content, index, bbox_x0, bbox_y0, bbox_x1, bbox_y1 }
        ordered by page_index, then paragraph index.
        """
        result = await self.db.execute(
            select(orm.Paragraph)
            .where(orm.Paragraph.book_id == book_id)
            .where(orm.Paragraph.content.ilike(f"%{query}%"))
            .order_by(orm.Paragraph.page_index, orm.Paragraph.index)
        )
        return [
            {
                "paragraph_id": p.id,
                "book_id": p.book_id,
                "chapter_id": p.chapter_id,
                "page_index": p.page_index,
                "content": p.content,
                "index": p.index,
                "bbox_x0": p.bbox_x0,
                "bbox_y0": p.bbox_y0,
                "bbox_x1": p.bbox_x1,
                "bbox_y1": p.bbox_y1,
            }
            for p in result.scalars().all()
        ]


# ── User ──────────────────────────────────────────────────────────────────


class UserRepositoryImpl(BaseRepositoryImpl, UserRepository):

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


# ── WordPosition ─────────────────────────────────────────────────────────


class WordPositionRepositoryImpl(BaseRepositoryImpl):
    """Repository for word-level bounding box positions."""

    async def bulk_save(self, positions: List[orm.WordPosition]) -> None:
        """Batch-insert WordPosition rows."""
        for wp in positions:
            self.db.add(wp)
        await self.db.commit()

    async def get_by_page(self, book_id: int, page_index: int) -> List[orm.WordPosition]:
        """Get all word positions for a specific page."""
        result = await self.db.execute(
            select(orm.WordPosition)
            .where(orm.WordPosition.book_id == book_id)
            .where(orm.WordPosition.page_index == page_index)
            .order_by(orm.WordPosition.word_index)
        )
        return list(result.scalars().all())

    async def delete_by_book(self, book_id: int) -> None:
        await self.db.execute(
            delete(orm.WordPosition).where(orm.WordPosition.book_id == book_id)
        )
        await self.db.commit()

    async def page_has_positions(self, book_id: int, page_index: int) -> bool:
        """Check if word positions already exist for a given page."""
        result = await self.db.execute(
            select(orm.WordPosition.id)
            .where(orm.WordPosition.book_id == book_id)
            .where(orm.WordPosition.page_index == page_index)
            .limit(1)
        )
        return result.scalar_one_or_none() is not None


# ── Vocabulary ───────────────────────────────────────────────────────────


class VocabularyRepositoryImpl(BaseRepositoryImpl):
    """Repository for user vocabulary words."""

    async def add(
        self, user_id: int, word: str, *,
        phonetic: Optional[str] = None,
        definition: Optional[str] = None,
        sentence_context: Optional[str] = None,
        sentence_context_translated: Optional[str] = None,
        translation: Optional[str] = None,
        book_id: Optional[int] = None,
    ) -> orm.VocabularyWord:
        vocab = orm.VocabularyWord(
            user_id=user_id,
            book_id=book_id,
            word=word,
            phonetic=phonetic,
            definition=definition,
            sentence_context=sentence_context,
            sentence_context_translated=sentence_context_translated,
            translation=translation,
        )
        self.db.add(vocab)
        await self.db.commit()
        await self.db.refresh(vocab)
        return vocab

    async def list_by_user(self, user_id: int) -> List[orm.VocabularyWord]:
        result = await self.db.execute(
            select(orm.VocabularyWord)
            .where(orm.VocabularyWord.user_id == user_id)
            .order_by(orm.VocabularyWord.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_by_book(self, user_id: int, book_id: int) -> List[orm.VocabularyWord]:
        result = await self.db.execute(
            select(orm.VocabularyWord)
            .where(orm.VocabularyWord.user_id == user_id)
            .where(orm.VocabularyWord.book_id == book_id)
            .order_by(orm.VocabularyWord.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_by_id(self, word_id: int) -> Optional[orm.VocabularyWord]:
        result = await self.db.execute(
            select(orm.VocabularyWord).where(orm.VocabularyWord.id == word_id)
        )
        return result.scalar_one_or_none()

    async def find_by_word(self, user_id: int, word: str) -> Optional[orm.VocabularyWord]:
        """Find a vocabulary word by user_id and word string (case-insensitive)."""
        result = await self.db.execute(
            select(orm.VocabularyWord)
            .where(orm.VocabularyWord.user_id == user_id)
            .where(orm.VocabularyWord.word.ilike(word))
            .order_by(orm.VocabularyWord.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def update_word(self, word_id: int, **fields) -> bool:
        """Update specific fields of a vocabulary word. Returns True if updated."""
        result = await self.db.execute(
            update(orm.VocabularyWord)
            .where(orm.VocabularyWord.id == word_id)
            .values(**fields)
        )
        await self.db.commit()
        return result.rowcount > 0

    async def delete(self, word_id: int) -> bool:
        result = await self.db.execute(
            select(orm.VocabularyWord).where(orm.VocabularyWord.id == word_id)
        )
        vocab = result.scalar_one_or_none()
        if vocab is None:
            return False
        await self.db.execute(
            delete(orm.VocabularyWord).where(orm.VocabularyWord.id == word_id)
        )
        await self.db.commit()
        return True