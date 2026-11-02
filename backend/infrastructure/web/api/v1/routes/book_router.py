"""Book routes: upload, list, detail, chapters, paragraphs, file serving, delete.

Integrated with:
- MinIO / S3 Object Storage (Zero local disk persistence)
- Automatic PDF to EPUB conversion for Foliate-js e-reader
"""
import io
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from domain.entities.book import Book, Chapter, Paragraph
from domain.entities.user import User
from infrastructure.database.postgres.epub_parser import EPUBParser
from infrastructure.database.postgres.pdf_parser import PDFParser
from infrastructure.database.postgres.repositories import (
    BookRepositoryImpl,
    ChapterRepositoryImpl,
    ParagraphRepositoryImpl,
)
from infrastructure.database.postgres.session import get_session
from infrastructure.storage.pdf_to_epub import PdfToEpubConverter
from infrastructure.storage.storage_service import storage_service
from infrastructure.web.api.v1.dependencies import get_current_user
from infrastructure.web.api.v1.schemas.book_schemas import (
    BookDetailResponse,
    BookListItem,
    ChapterParagraphsResponse,
    ChapterResponse,
    ParagraphResponse,
    RegisterBookResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".epub", ".pdf"}


# ── Private helpers ──────────────────────────────────────────────────────


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


async def _get_owned_book(book_id: int, user_id: int, db: AsyncSession) -> Book:
    """Fetch a book and verify the requesting user owns it."""
    repo = BookRepositoryImpl(db)
    book = await repo.get_book_by_id(book_id)
    if book is None or book.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return book


# ── Upload & Register ────────────────────────────────────────────────────


@router.post("/register", response_model=RegisterBookResponse, status_code=status.HTTP_201_CREATED)
async def register_book(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Upload an EPUB or PDF file, store in MinIO/S3, convert to EPUB if PDF, and register book."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    file_bytes = await file.read()
    file_id = uuid.uuid4().hex
    original_key = f"books/{current_user.id}/{file_id}{ext}"
    epub_key = f"books/{current_user.id}/{file_id}.epub"

    # 1. Upload original file to MinIO Object Storage
    content_type = "application/epub+zip" if ext == ".epub" else "application/pdf"
    storage_service.upload_bytes(file_bytes, original_key, content_type)

    title = Path(file.filename or "Untitled").stem
    author = "Unknown Author"
    total_pages = 0
    chapters_meta = []

    # 2. Extract metadata & generate e-reader EPUB if PDF
    if ext == ".pdf":
        import fitz
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            total_pages = len(doc)
            meta = doc.metadata or {}
            title = meta.get("title") or title
            author = meta.get("author") or author
            toc = doc.get_toc()
            if toc:
                chapters_meta = [{"title": t[1], "spine_index": i} for i, t in enumerate(toc)]
            else:
                chapters_meta = [{"title": f"Page {i + 1}", "spine_index": i} for i in range(total_pages)]
            
            # Generate and upload the Reflowable EPUB for the reader
            epub_bytes = PdfToEpubConverter.convert(file_bytes, title, author)
            storage_service.upload_bytes(epub_bytes, epub_key, "application/epub+zip")
        except Exception as exc:
            logger.error("Failed to parse PDF metadata: %s", exc)
    else:
        # Already an EPUB
        try:
            parser = EPUBParser()
            meta = parser.extract_metadata_from_bytes(file_bytes) if hasattr(parser, "extract_metadata_from_bytes") else {}
            title = meta.get("title") or title
            author = meta.get("author") or author
        except Exception as exc:
            logger.warning("EPUB metadata warning: %s", exc)

    # 3. Persist book in database
    book = Book(
        user_id=current_user.id,
        title=title,
        author=author,
        file_path=original_key,  # S3 Object Key
        total_chapters=len(chapters_meta),
        total_pages=total_pages,
        language="en",
        status="ready",
    )
    repo = BookRepositoryImpl(db)
    book = await repo.add_book(book)

    # Persist chapters
    if chapters_meta:
        chapter_entities = [
            Chapter(
                book_id=book.id,
                title=ch.get("title", f"Chapter {i + 1}"),
                spine_index=ch.get("spine_index", i),
                is_parsed=True,
            )
            for i, ch in enumerate(chapters_meta)
        ]
        chapter_repo = ChapterRepositoryImpl(db)
        await chapter_repo.add_chapters(chapter_entities)

    logger.info("Book registered in MinIO: id=%d title=%s", book.id, book.title)

    return RegisterBookResponse(
        id=book.id,
        title=book.title,
        author=book.author,
        total_chapters=book.total_chapters,
        total_pages=book.total_pages,
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
    """Return all books owned by the authenticated user."""
    repo = BookRepositoryImpl(db)
    books = await repo.get_books_by_user(current_user.id)
    return [
        BookListItem(
            id=b.id,
            title=b.title,
            author=b.author,
            total_chapters=b.total_chapters,
            total_pages=b.total_pages,
            language=b.language,
            status=b.status,
            created_at=b.created_at,
        )
        for b in books
    ]


@router.get("/{book_id}", response_model=BookDetailResponse)
async def get_book(
    book_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return book detail and its chapter list."""
    book = await _get_owned_book(book_id, current_user.id, db)
    chapter_repo = ChapterRepositoryImpl(db)
    chapters = await chapter_repo.get_chapters_by_book(book_id)

    return BookDetailResponse(
        id=book.id,
        title=book.title,
        author=book.author,
        file_path=book.file_path,
        total_chapters=book.total_chapters,
        total_pages=book.total_pages,
        language=book.language,
        status=book.status,
        created_at=book.created_at,
        chapters=[_chapter_to_response(c) for c in chapters],
    )


@router.get("/{book_id}/chapters", response_model=list[ChapterResponse])
async def list_chapters(
    book_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return the ordered list of chapters for a book."""
    await _get_owned_book(book_id, current_user.id, db)
    chapter_repo = ChapterRepositoryImpl(db)
    chapters = await chapter_repo.get_chapters_by_book(book_id)
    return [_chapter_to_response(c) for c in chapters]


@router.get("/{book_id}/chapters/{chapter_id}/paragraphs", response_model=list[ParagraphResponse])
async def get_chapter_paragraphs(
    book_id: int,
    chapter_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return paragraphs for a given chapter."""
    await _get_owned_book(book_id, current_user.id, db)
    para_repo = ParagraphRepositoryImpl(db)
    paragraphs = await para_repo.get_paragraphs_by_chapter(chapter_id)
    return [_paragraph_to_response(p) for p in paragraphs]


# ── File serving from MinIO ──────────────────────────────────────────────


@router.get("/{book_id}/file")
async def get_book_file(
    book_id: int,
    format: str = "original",  # 'original' or 'epub'
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Serve the book file directly from MinIO / S3 Object Storage."""
    book = await _get_owned_book(book_id, current_user.id, db)

    key = book.file_path
    if format == "epub" and key.endswith(".pdf"):
        epub_key = key[:-4] + ".epub"
        try:
            data = storage_service.get_file_bytes(epub_key)
            return Response(content=data, media_type="application/epub+zip")
        except Exception:
            # Convert on-the-fly if EPUB is missing in MinIO and cache it
            try:
                pdf_bytes = storage_service.get_file_bytes(key)
                epub_bytes = PdfToEpubConverter.convert(pdf_bytes, book.title, book.author)
                storage_service.upload_bytes(epub_bytes, epub_key, "application/epub+zip")
                return Response(content=epub_bytes, media_type="application/epub+zip")
            except Exception as conv_exc:
                logger.error("Failed on-the-fly PDF->EPUB conversion (%s): %s", key, conv_exc)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to convert PDF to EPUB",
                )

    try:
        data = storage_service.get_file_bytes(key)
    except Exception as exc:
        logger.error("Failed to fetch file from MinIO (%s): %s", key, exc)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage")

    media_type = "application/epub+zip" if key.endswith(".epub") else "application/pdf"
    return Response(content=data, media_type=media_type)


# ── Delete ───────────────────────────────────────────────────────────────


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    book_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a book and its files from MinIO."""
    book = await _get_owned_book(book_id, current_user.id, db)
    repo = BookRepositoryImpl(db)
    await repo.delete_book(book_id)

    # Delete original and converted EPUB from MinIO
    storage_service.delete_file(book.file_path)
    if book.file_path.endswith(".pdf"):
        storage_service.delete_file(book.file_path[:-4] + ".epub")

    logger.info("Book and files deleted from MinIO: id=%d", book_id)
