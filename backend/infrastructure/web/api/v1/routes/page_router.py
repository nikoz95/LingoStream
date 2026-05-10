"""Page routes: serve rendered page images + text overlay for the image+overlay reader.

For PDF books, the backend renders each page as a PNG image on demand, caches it,
and serves both the image and the per-paragraph bbox data so the frontend can overlay
a transparent clickable text layer for word selection and translation.
"""
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import settings
from domain.entities.book import Book, PageImage, Paragraph
from domain.entities.user import User
from infrastructure.database.postgres.pdf_parser import PDFParser
from infrastructure.database.postgres.repositories import (
    BookRepositoryImpl,
    ChapterRepositoryImpl,
    PageImageRepositoryImpl,
    ParagraphRepositoryImpl,
)
from infrastructure.database.postgres.session import get_session
from infrastructure.web.api.v1.dependencies import get_current_user
from infrastructure.web.api.v1.schemas.book_schemas import (
    PageImageResponse,
    PageInfoResponse,
    ParagraphResponse,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Directory to cache rendered page images
CACHE_DIR = Path(settings.PAGE_IMAGE_CACHE_DIR) if hasattr(settings, "PAGE_IMAGE_CACHE_DIR") else Path("uploads/page_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ──────────────────────────────────────────────────────────────


async def _get_owned_book(book_id: int, user_id: int, db: AsyncSession) -> Book:
    """Fetch a book and verify ownership."""
    repo = BookRepositoryImpl(db)
    book = await repo.get_book_by_id(book_id)
    if book is None or book.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return book


def _paragraph_to_response(p: Paragraph) -> ParagraphResponse:
    return ParagraphResponse(
        id=p.id, book_id=p.book_id, chapter_id=p.chapter_id,
        content=p.content, index=p.index,
        page_index=p.page_index,
        bbox_x0=p.bbox_x0, bbox_y0=p.bbox_y0,
        bbox_x1=p.bbox_x1, bbox_y1=p.bbox_y1,
        phonetic_transcription=p.phonetic_transcription,
    )


async def _ensure_pdf_parsed(db: AsyncSession, book: Book) -> int:
    """
    Parse all unparsed chapters/pages of a PDF book into paragraphs with bbox data.

    Returns total page count.
    """
    pdf_parser = PDFParser()
    try:
        total_pages = pdf_parser.get_page_count(book.file_path)
        chapter_repo = ChapterRepositoryImpl(db)
        chapters = await chapter_repo.get_chapters_by_book(book.id)

        para_repo = ParagraphRepositoryImpl(db)

        for chapter in chapters:
            if chapter.is_parsed:
                continue

            # For PDF, each chapter is one page. Parse with bbox positions.
            blocks = pdf_parser.parse_page_with_positions(
                book.file_path,
                spine_index=chapter.spine_index,
                page_index=chapter.spine_index,
            )

            paragraphs = [
                Paragraph(
                    book_id=book.id,
                    chapter_id=chapter.id,
                    content=content,
                    index=idx,
                    page_index=chapter.spine_index,
                    bbox_x0=x0, bbox_y0=y0, bbox_x1=x1, bbox_y1=y1,
                )
                for idx, content, x0, y0, x1, y1 in blocks
            ]

            if paragraphs:
                await para_repo.add_paragraphs(paragraphs)

            await chapter_repo.mark_chapter_parsed(
                chapter.id, 0, len(paragraphs) - 1, len(paragraphs)
            )
            logger.info(
                "Parsed %d paragraphs for chapter %d (page %d)",
                len(paragraphs), chapter.id, chapter.spine_index,
            )

        return total_pages
    finally:
        pdf_parser.close()


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get("/{book_id}/pages/{page_index}/image", response_class=Response)
async def get_page_image(
    book_id: int,
    page_index: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Serve a rendered PDF page as a PNG image.

    Caches the rendered image on first access. Subsequent requests return the cached file.
    """
    book = await _get_owned_book(book_id, current_user.id, db)

    # Check cache first
    cache_key = f"{book_id}_{page_index}.png"
    cache_path = CACHE_DIR / cache_key

    if cache_path.exists():
        return Response(content=cache_path.read_bytes(), media_type="image/png")

    # Render + cache
    parser = PDFParser()
    try:
        image_bytes = parser.render_page(book.file_path, page_index)
        cache_path.write_bytes(image_bytes)
        return Response(content=image_bytes, media_type="image/png")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to render page %d of book %d: %s", page_index, book_id, exc)
        raise HTTPException(status_code=500, detail="Failed to render page")
    finally:
        parser.close()


@router.get("/{book_id}/thumbnails/{page_index}", response_class=Response)
async def get_page_thumbnail(
    book_id: int,
    page_index: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Serve a small thumbnail of a PDF page."""
    book = await _get_owned_book(book_id, current_user.id, db)

    cache_key = f"{book_id}_{page_index}_thumb.png"
    cache_path = CACHE_DIR / cache_key

    if cache_path.exists():
        return Response(content=cache_path.read_bytes(), media_type="image/png")

    parser = PDFParser()
    try:
        thumb_bytes = parser.render_thumbnail(book.file_path, page_index)
        cache_path.write_bytes(thumb_bytes)
        return Response(content=thumb_bytes, media_type="image/png")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to render thumbnail page %d of book %d: %s", page_index, book_id, exc)
        raise HTTPException(status_code=500, detail="Failed to render thumbnail")
    finally:
        parser.close()


@router.get("/{book_id}/pages/{page_index}/text-overlay", response_model=PageInfoResponse)
async def get_page_text_overlay(
    book_id: int,
    page_index: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get text overlay data for a PDF page.

    Returns the paragraphs with bbox coordinates for the given page,
    along with the page dimensions so the frontend can scale the overlay.
    """
    book = await _get_owned_book(book_id, current_user.id, db)

    # Ensure PDF is parsed
    await _ensure_pdf_parsed(db, book)

    para_repo = ParagraphRepositoryImpl(db)
    paragraphs = await para_repo.get_paragraphs_by_page(book_id, page_index)

    # Estimate page dimensions from the rendered image (cached)
    parser = PDFParser()
    try:
        dims = parser.get_page_dimensions(book.file_path, page_index)
        if dims:
            width, height = int(dims[0]), int(dims[1])
        else:
            width, height = 612, 792
    except Exception:
        # Fallback dimensions
        width = 612  # US Letter points
        height = 792
    finally:
        parser.close()

    return PageInfoResponse(
        book_id=book_id,
        page_index=page_index,
        width=width,
        height=height,
        dpi=150,
        paragraphs=[_paragraph_to_response(p) for p in paragraphs],
    )


@router.get("/{book_id}/pages-info", response_model=list[PageImageResponse])
async def get_pages_info(
    book_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get image URLs for all pages of a PDF book, for preloading."""
    book = await _get_owned_book(book_id, current_user.id, db)

    parser = PDFParser()
    try:
        total_pages = parser.get_page_count(book.file_path)
        return [
            PageImageResponse(
                book_id=book_id,
                page_index=i,
                image_url=f"/api/v1/pages/{book_id}/pages/{i}/image",
                thumb_url=f"/api/v1/pages/{book_id}/thumbnails/{i}",
                width=612,
                height=792,
            )
            for i in range(total_pages)
        ]
    finally:
        parser.close()


@router.get("/{book_id}/page-count", response_model=dict)
async def get_page_count(
    book_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get the total number of pages in a PDF book."""
    book = await _get_owned_book(book_id, current_user.id, db)

    parser = PDFParser()
    try:
        total_pages = parser.get_page_count(book.file_path)
        return {"book_id": book_id, "total_pages": total_pages}
    finally:
        parser.close()


@router.get("/{book_id}/search", response_model=SearchResponse)
async def search_book(
    book_id: int,
    query: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Search paragraphs within a book (full-text, case-insensitive)."""
    book = await _get_owned_book(book_id, current_user.id, db)

    # Ensure PDF is fully parsed
    await _ensure_pdf_parsed(db, book)

    para_repo = ParagraphRepositoryImpl(db)
    results = await para_repo.search_paragraphs(book_id, query)

    return SearchResponse(
        query=query,
        total_results=len(results),
        results=[SearchResultItem(**r) for r in results],
    )
