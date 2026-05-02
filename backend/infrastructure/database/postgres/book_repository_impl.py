from typing import Optional, List
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from domain.entities.book import Book, Chapter, Paragraph
from domain.repositories.book_repository import BookRepository, ChapterRepository, ParagraphRepository
from infrastructure.database.postgres.models import (
    Book as BookDB,
    Chapter as ChapterDB,
    Paragraph as ParagraphDB,
)


class BookRepositoryImpl(BookRepository):
    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session

    async def add_book(self, book: Book) -> Book:
        book_db = BookDB(
            title=book.title,
            author=book.author,
            file_path=book.file_path,
            total_chapters=book.total_chapters,
            language=book.language,
            status=book.status,
        )
        self.db_session.add(book_db)
        await self.db_session.commit()
        await self.db_session.refresh(book_db)

        return Book(
            id=book_db.id,
            title=book_db.title,
            author=book_db.author,
            file_path=book_db.file_path,
            total_chapters=book_db.total_chapters,
            language=book_db.language,
            status=book_db.status,
            created_at=book_db.created_at,
            updated_at=book_db.updated_at,
        )

    async def get_book_by_id(self, book_id: int) -> Optional[Book]:
        result = await self.db_session.execute(
            select(BookDB).where(BookDB.id == book_id)
        )
        book_db = result.scalar_one_or_none()
        if book_db is None:
            return None
        return Book(
            id=book_db.id,
            title=book_db.title,
            author=book_db.author,
            file_path=book_db.file_path,
            total_chapters=book_db.total_chapters,
            language=book_db.language,
            status=book_db.status,
            created_at=book_db.created_at,
            updated_at=book_db.updated_at,
        )

    async def get_books_by_user(self, user_id: int) -> List[Book]:
        # Simple implementation — in production, you'd have a user_book junction table.
        # For now, return all books (multi-tenant support can come later).
        result = await self.db_session.execute(
            select(BookDB).order_by(BookDB.created_at.desc())
        )
        books_db = result.scalars().all()
        return [
            Book(
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
            for b in books_db
        ]

    async def update_book_status(self, book_id: int, status: str) -> None:
        await self.db_session.execute(
            update(BookDB).where(BookDB.id == book_id).values(status=status)
        )
        await self.db_session.commit()

    async def delete_book(self, book_id: int) -> None:
        await self.db_session.execute(
            delete(BookDB).where(BookDB.id == book_id)
        )
        await self.db_session.commit()


class ChapterRepositoryImpl(ChapterRepository):
    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session

    async def add_chapters(self, chapters: List[Chapter]) -> List[Chapter]:
        chapters_db = []
        for ch in chapters:
            ch_db = ChapterDB(
                book_id=ch.book_id,
                title=ch.title,
                spine_index=ch.spine_index,
            )
            self.db_session.add(ch_db)
            chapters_db.append(ch_db)

        await self.db_session.commit()

        # Refresh all
        result = []
        for ch_db in chapters_db:
            await self.db_session.refresh(ch_db)
            result.append(Chapter(
                id=ch_db.id,
                book_id=ch_db.book_id,
                title=ch_db.title,
                spine_index=ch_db.spine_index,
                sequence_start=ch_db.sequence_start,
                sequence_end=ch_db.sequence_end,
                paragraph_count=ch_db.paragraph_count,
                is_parsed=ch_db.is_parsed,
                created_at=ch_db.created_at,
            ))
        return result

    async def get_chapters_by_book(self, book_id: int) -> List[Chapter]:
        result = await self.db_session.execute(
            select(ChapterDB)
            .where(ChapterDB.book_id == book_id)
            .order_by(ChapterDB.spine_index)
        )
        chapters_db = result.scalars().all()
        return [
            Chapter(
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
            for ch in chapters_db
        ]

    async def get_chapter_by_id(self, chapter_id: int) -> Optional[Chapter]:
        result = await self.db_session.execute(
            select(ChapterDB).where(ChapterDB.id == chapter_id)
        )
        ch = result.scalar_one_or_none()
        if ch is None:
            return None
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

    async def mark_chapter_parsed(
        self, chapter_id: int, seq_start: int, seq_end: int, count: int
    ) -> None:
        await self.db_session.execute(
            update(ChapterDB)
            .where(ChapterDB.id == chapter_id)
            .values(
                sequence_start=seq_start,
                sequence_end=seq_end,
                paragraph_count=count,
                is_parsed=True,
            )
        )
        await self.db_session.commit()

    async def get_next_unparsed_chapter(self, book_id: int) -> Optional[Chapter]:
        result = await self.db_session.execute(
            select(ChapterDB)
            .where(ChapterDB.book_id == book_id, ChapterDB.is_parsed == False)
            .order_by(ChapterDB.spine_index)
            .limit(1)
        )
        ch = result.scalar_one_or_none()
        if ch is None:
            return None
        return Chapter(
            id=ch.id,
            book_id=ch.book_id,
            title=ch.title,
            spine_index=ch.spine_index,
            created_at=ch.created_at,
        )


class ParagraphRepositoryImpl(ParagraphRepository):
    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session

    async def add_paragraphs(self, paragraphs: List[Paragraph]) -> None:
        paragraphs_db = []
        for p in paragraphs:
            p_db = ParagraphDB(
                book_id=p.book_id,
                chapter_id=p.chapter_id,
                content=p.content,
                index=p.index,
            )
            self.db_session.add(p_db)
            paragraphs_db.append(p_db)

        await self.db_session.commit()

    async def get_paragraphs_by_chapter(self, chapter_id: int) -> List[Paragraph]:
        result = await self.db_session.execute(
            select(ParagraphDB)
            .where(ParagraphDB.chapter_id == chapter_id)
            .order_by(ParagraphDB.index)
        )
        paragraphs_db = result.scalars().all()
        return [
            Paragraph(
                id=p.id,
                book_id=p.book_id,
                chapter_id=p.chapter_id,
                content=p.content,
                index=p.index,
                phonetic_transcription=p.phonetic_transcription,
            )
            for p in paragraphs_db
        ]

    async def get_paragraph_by_id(self, paragraph_id: int) -> Optional[Paragraph]:
        result = await self.db_session.execute(
            select(ParagraphDB).where(ParagraphDB.id == paragraph_id)
        )
        p = result.scalar_one_or_none()
        if p is None:
            return None
        return Paragraph(
            id=p.id,
            book_id=p.book_id,
            chapter_id=p.chapter_id,
            content=p.content,
            index=p.index,
            phonetic_transcription=p.phonetic_transcription,
        )

    async def get_paragraphs_by_book_batch(
        self, book_id: int, offset: int, limit: int
    ) -> List[Paragraph]:
        result = await self.db_session.execute(
            select(ParagraphDB)
            .where(ParagraphDB.book_id == book_id)
            .order_by(ParagraphDB.index)
            .offset(offset)
            .limit(limit)
        )
        paragraphs_db = result.scalars().all()
        return [
            Paragraph(
                id=p.id,
                book_id=p.book_id,
                chapter_id=p.chapter_id,
                content=p.content,
                index=p.index,
                phonetic_transcription=p.phonetic_transcription,
            )
            for p in paragraphs_db
        ]

    async def count_paragraphs_by_book(self, book_id: int) -> int:
        result = await self.db_session.execute(
            select(func.count(ParagraphDB.id)).where(ParagraphDB.book_id == book_id)
        )
        return result.scalar() or 0