"""Page routes: word-level bounding box coordinates for the clickable overlay reader.

For PDF books, the backend extracts word-level positions (bounding boxes) via PyMuPDF
during lazy parsing and serves them on demand. The frontend renders PDF via PDF.js
and uses these coordinates to place transparent click zones over each word.

No server-side image rendering — zero caching of page images.
"""
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from domain.entities.user import User
from infrastructure.database.postgres.pdf_parser import PDFParser
from infrastructure.database.postgres.repositories import (
    BookRepositoryImpl,
    WordPositionRepositoryImpl,
)
from infrastructure.database.postgres.session import get_session
from infrastructure.web.api.v1.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────


class WordPositionResponse(BaseModel):
    """A single word with its bounding box in PDF point coordinates."""
    word: str
    x0: float
    y0: float
    x1: float
    y1: float
    word_index: int
    line_index: int
    block_index: int


class WordPositionsPageResponse(BaseModel):
    """All word positions for one page, plus page dimensions for scaling."""
    book_id: int
    page_index: int
    page_width: float
    page_height: float
    words: list[WordPositionResponse]


class PageCountResponse(BaseModel):
    book_id: int
    total_pages: int


# ── Helpers ──────────────────────────────────────────────────────────────


async def _get_owned_book(book_id: int, user_id: int, db: AsyncSession):
    """Fetch a book and verify ownership."""
    repo = BookRepositoryImpl(db)
    book = await repo.get_book_by_id(book_id)
    if book is None or book.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return book


async def _ensure_page_words_indexed(
    db: AsyncSession, book_id: int, page_index: int, file_path: str,
) -> None:
    """Lazy-index word positions for a page if not already done."""
    wp_repo = WordPositionRepositoryImpl(db)
    if await wp_repo.page_has_positions(book_id, page_index):
        return

    parser = PDFParser(file_path)
    try:
        raw_words = parser.extract_words_with_positions(page_index)
        if not raw_words:
            return

        from infrastructure.database.postgres import models as orm

        positions = [
            orm.WordPosition(
                book_id=book_id,
                page_index=page_index,
                word=w["word"],
                x0=w["x0"],
                y0=w["y0"],
                x1=w["x1"],
                y1=w["y1"],
                word_index=w["word_index"],
                line_index=w["line_index"],
                block_index=w["block_index"],
            )
            for w in raw_words
        ]
        await wp_repo.bulk_save(positions)
        logger.info(
            "Indexed %d word positions for book %d page %d",
            len(positions), book_id, page_index,
        )
    finally:
        parser.close()


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get("/{book_id}/word-positions/{page_index}", response_model=WordPositionsPageResponse)
async def get_word_positions(
    book_id: int,
    page_index: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get word-level bounding box positions for a page.

    Extract is lazy: runs on first access, then cached in the database.
    The frontend uses these coordinates to place transparent click zones
    over the PDF.js rendered page.
    """
    book = await _get_owned_book(book_id, current_user.id, db)

    ext = Path(book.file_path).suffix.lower()
    if ext != ".pdf":
        raise HTTPException(status_code=400, detail="Word positions only available for PDF books")

    # Lazy parse word positions
    await _ensure_page_words_indexed(db, book_id, page_index, book.file_path)

    # Fetch from DB
    wp_repo = WordPositionRepositoryImpl(db)
    rows = await wp_repo.get_by_page(book_id, page_index)

    # Get page dimensions
    parser = PDFParser(book.file_path)
    try:
        dims = parser.get_page_dimensions(page_index)
        page_width = dims["width"]
        page_height = dims["height"]
    except Exception:
        page_width, page_height = 612.0, 792.0
    finally:
        parser.close()

    return WordPositionsPageResponse(
        book_id=book_id,
        page_index=page_index,
        page_width=page_width,
        page_height=page_height,
        words=[
            WordPositionResponse(
                word=row.word,
                x0=row.x0,
                y0=row.y0,
                x1=row.x1,
                y1=row.y1,
                word_index=row.word_index,
                line_index=row.line_index,
                block_index=row.block_index,
            )
            for row in rows
        ],
    )


@router.get("/{book_id}/page-count", response_model=PageCountResponse)
async def get_page_count(
    book_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get the total number of pages in a PDF book."""
    book = await _get_owned_book(book_id, current_user.id, db)

    parser = PDFParser(book.file_path)
    try:
        total_pages = parser.get_page_count()
        return PageCountResponse(book_id=book_id, total_pages=total_pages)
    finally:
        parser.close()