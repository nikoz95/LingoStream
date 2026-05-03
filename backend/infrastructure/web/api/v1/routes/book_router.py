"""Book routes: upload, list, detail, chapters, paragraphs, delete."""
import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import settings
from domain.entities.book import Book, Chapter, Paragraph
from infrastructure.database.postgres.repositories import (
    BookRepositoryImpl,
    ChapterRepositoryImpl,
    ParagraphRepositoryImpl,
)
from infrastructure.database.postgres.epub_parser import EPUBParser
from infrastructure.database.postgres.pdf_parser import PDFParser
from infrastructure.web.api.v1.dependencies import get_current_user
from infrastructure.web.api.v1.schemas.book_schemas import (
    BookDetailResponse,
    BookListItem,
    ChapterParagraphsResponse,
    ChapterResponse,
    ParagraphResponse,
    RegisterBookResponse,
)
from domain.entities.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".epub", ".pdf"}


# ── Helpers ──────────────────────────────────────────────────────────────


def _get_parser(file_path: str) -> EPUBParser | PDFParser:
    """Dispatch to the appropriate parser based on file extension."""
    ext = Path(file_path).suffix.lower()
    if ext == ".epub":
        return EPUBParser()
    if ext == ".pdf":
        return PDFParser()
    raise ValueError(f"Unsupported file type: {ext}")


async def _ensure_chapter_parsed(
    db: AsyncSession,
    chapter: Chapter,
    book_file_path: str,
) -> Chapter:
    """If a chapter is not yet parsed, parse it and persist paragraphs.

    Returns the (possibly updated) chapter object.
    """
    if chapter.is_parsed:
        return chapter

    parser = _get_parser(book_file_path)
    try:
        blocks = parser.parse_chapter(book_file_path, chapter.spine_index)
        paragraphs = [
            Paragraph(
                book_id=chapter.book_id,
                chapter_id=chapter.id,
                content=content,
                index=idx,
            )
            for idx, content in blocks
        ]
        para_repo = ParagraphRepositoryImpl(db)
        await para_repo.add_paragraphs(paragraphs)

        chapter_repo = ChapterRepositoryImpl(db)
        await chapter_repo.mark_chapter_parsed(
            chapter.id, 0, len(blocks) - 1, len(blocks)
        )
        logger.info("Parsed %d paragraphs for chapter %d", len(blocks), chapter.id)

        # Re-fetch to get updated state
        updated = await chapter_repo.get_chapter_by_id(chapter.id)
        return updated or chapter
    except Exception as exc:
        logger.error("Failed to parse chapter %d: %s", chapter.id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse chapter: {exc}",
        )


def _chapter_to_response(ch: Chapter) -> ChapterResponse:
    return ChapterResponse(
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


def _paragraph_to_response(p: Paragraph) -> ParagraphResponse:
    return ParagraphResponse(
        id=p.id,
        book_id=p.book_id,
        chapter_id=p.chapter_id,
        content=p.content,
        index=p.index,
        phonetic_transcription=p.phonetic_transcription,
    )


# ── Upload & Register ────────────────────────────────────────────────────


@router.post("/register", response_model=RegisterBookResponse, status_code=status.HTTP_201_CREATED)
async def register_book(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Upload an EPUB or PDF file, extract metadata, and register the book."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Save file
    filename = f"{uuid.uuid4().hex}{ext}"
    save_path = UPLOAD_DIR / filename
    save_path.write_bytes(await file.read())
    file_path = str(save_path)

    # Parse metadata
    parser = _get_parser(file_path)
    meta = parser.extract_metadata(file_path)
    chapters_meta = parser.extract_toc(file_path)

    # Persist book
    book = Book(
        title=meta.get("title", file.filename or "Untitled"),
        author=meta.get("author", "Unknown Author"),
        file_path=file_path,
        total_chapters=len(chapters_meta),
        language=meta.get("language", "en"),
        status="processing",
    )
    repo = BookRepositoryImpl(db)
    book = await repo.add_book(book)

    # Persist chapters
    chapter_entities = [
        Chapter(
            book_id=book.id,
            title=ch.get("title", f"Chapter {i + 1}"),
            spine_index=ch.get("spine_index", i),
        )
        for i, ch in enumerate(chapters_meta)
    ]
    chapter_repo = ChapterRepositoryImpl(db)
    saved_chapters = await chapter_repo.add_chapters(chapter_entities)

    # Parse first chapter immediately
    if saved_chapters:
        try:
            await _ensure_chapter_parsed(db, saved_chapters[0], file_path)
        except Exception as exc:
            logger.warning("Failed to parse first chapter for book %d: %s", book.id, exc)

    await repo.update_book_status(book.id, "ready")
    logger.info("Book registered: id=%d title=%s", book.id, book.title)

    return RegisterBookResponse(
        id=book.id,
        title=book.title,
        author=book.author,
        total_chapters=book.total_chapters,
        language=book.language,
        status="ready",
        created_at=book.created_at,
    )


# ── List & Detail ────────────────────────────────────────────────────────


@router.get("", response_model=list[BookListItem])
async def list_books(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = BookRepositoryImpl(db)
    books = await repo.get_books_by_user(current_user.id)
    return [BookListItem.model_validate(b) for b in books]


@router.get("/{book_id}", response_model=BookDetailResponse)
async def get_book_detail(
    book_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = BookRepositoryImpl(db)
    book = await repo.get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    chapter_repo = ChapterRepositoryImpl(db)
    chapters = await chapter_repo.get_chapters_by_book(book_id)

    return BookDetailResponse(
        id=book.id,
        title=book.title,
        author=book.author,
        file_path=book.file_path,
        total_chapters=book.total_chapters,
        language=book.language,
        status=book.status,
        chapters=[_chapter_to_response(ch) for ch in chapters],
        created_at=book.created_at,
        updated_at=book.updated_at,
    )


# ── Chapters & Paragraphs ───────────────────────────────────────────────


@router.get("/{book_id}/chapters", response_model=list[ChapterResponse])
async def list_chapters(
    book_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = ChapterRepositoryImpl(db)
    chapters = await repo.get_chapters_by_book(book_id)
    return [_chapter_to_response(ch) for ch in chapters]


@router.get("/{book_id}/chapters/{chapter_id}", response_model=ChapterParagraphsResponse)
async def get_chapter_with_paragraphs(
    book_id: int,
    chapter_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    chapter_repo = ChapterRepositoryImpl(db)
    chapter = await chapter_repo.get_chapter_by_id(chapter_id)
    if chapter is None or chapter.book_id != book_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")

    book_repo = BookRepositoryImpl(db)
    book = await book_repo.get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    chapter = await _ensure_chapter_parsed(db, chapter, book.file_path)

    para_repo = ParagraphRepositoryImpl(db)
    paragraphs = await para_repo.get_paragraphs_by_chapter(chapter_id)

    return ChapterParagraphsResponse(
        chapter=_chapter_to_response(chapter),
        paragraphs=[_paragraph_to_response(p) for p in paragraphs],
    )


@router.get("/{book_id}/chapters/{chapter_id}/paragraphs", response_model=list[ParagraphResponse])
async def get_paragraphs(
    book_id: int,
    chapter_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    chapter_repo = ChapterRepositoryImpl(db)
    chapter = await chapter_repo.get_chapter_by_id(chapter_id)
    if chapter is None or chapter.book_id != book_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")

    book_repo = BookRepositoryImpl(db)
    book = await book_repo.get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    await _ensure_chapter_parsed(db, chapter, book.file_path)

    para_repo = ParagraphRepositoryImpl(db)
    paragraphs = await para_repo.get_paragraphs_by_chapter(chapter_id)
    return [_paragraph_to_response(p) for p in paragraphs]


# ── File serving ─────────────────────────────────────────────────────────


@router.get("/{book_id}/file")
async def get_book_file(
    book_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Serve the original uploaded file (EPUB or PDF)."""
    repo = BookRepositoryImpl(db)
    book = await repo.get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    file_path = Path(book.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    media_type = "application/epub+zip" if file_path.suffix.lower() == ".epub" else "application/pdf"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
    )


# ── Delete ───────────────────────────────────────────────────────────────


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    book_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a book and its associated data."""
    repo = BookRepositoryImpl(db)
    file_path = await repo.delete_book(book_id)
    if file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    try:
        Path(file_path).unlink(missing_ok=True)
    except Exception as exc:
        logger.warning("Failed to delete file %s: %s", file_path, exc)
    logger.info("Book deleted: id=%d", book_id)