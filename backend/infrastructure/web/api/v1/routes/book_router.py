"""
Book management, chapter parsing, and translation endpoints.

Key design:
- Books are registered via file upload (EPUB/PDF)
- Chapter parsing is lazy: Chapter 1 is parsed immediately, the rest in background
- Translation uses an LLM with surrounding context for literary quality
"""
import os
import uuid
import logging
from pathlib import Path
from typing import List, Tuple

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from bs4 import BeautifulSoup

from infrastructure.database.postgres.session import get_db
from infrastructure.database.postgres.epub_parser import EPUBParser
from infrastructure.database.postgres.pdf_parser import PDFParser
from infrastructure.database.postgres.book_repository_impl import (
    BookRepositoryImpl,
    ChapterRepositoryImpl,
    ParagraphRepositoryImpl,
)
from infrastructure.web.api.v1.schemas.book_schemas import (
    RegisterBookResponse,
    BookDetailResponse,
    BookListItem,
    ChapterResponse,
    ChapterParagraphsResponse,
    ParagraphResponse,
    TranslatePassageRequest,
    TranslatePassageResponse,
    TranslateTextRequest,
    TranslateTextResponse,
)
from infrastructure.web.api.v1.dependencies import get_current_user
from infrastructure.security import jwt_service as jwt
from infrastructure.security.token_blacklist import TokenBlacklistService
from infrastructure.database.postgres.user_repository_impl import UserRepositoryImpl
from domain.entities.user import User
from domain.entities.book import Book, Chapter, Paragraph
from infrastructure.ai.translation_service import TranslationService

logger = logging.getLogger(__name__)

# Upload directory — mounted volume or fallback to /tmp
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/app/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(tags=["books"])


# ── Helpers ──


def _get_parser(file_path: str):
    """Return the appropriate parser based on file extension."""
    ext = file_path.lower().rsplit(".", 1)[-1] if "." in file_path else ""
    return EPUBParser() if ext == "epub" else PDFParser()


async def _parse_chapter_content(
    file_path: str,
    chapter: Chapter,
    book_id: int,
    db: AsyncSession,
) -> List[Paragraph]:
    """
    Parse a single chapter and persist its paragraphs.

    Determines the correct global sequence start index by looking at
    previously parsed chapters of the same book.
    Returns the list of newly created Paragraph objects.
    """
    chapter_repo = ChapterRepositoryImpl(db)
    paragraph_repo = ParagraphRepositoryImpl(db)
    parser = _get_parser(file_path)

    # Find the global start index — end of previous parsed chapter + 1
    all_chapters = await chapter_repo.get_chapters_by_book(book_id)
    global_start = 0
    for prev_ch in all_chapters:
        if prev_ch.spine_index < chapter.spine_index and prev_ch.is_parsed:
            global_start = max(global_start, prev_ch.sequence_end + 1)

    paragraph_tuples = parser.parse_chapter(file_path, chapter.spine_index, global_start)
    if not paragraph_tuples:
        return []

    paragraphs = [
        Paragraph(book_id=book_id, chapter_id=chapter.id, content=content, index=idx)
        for idx, content in paragraph_tuples
    ]
    await paragraph_repo.add_paragraphs(paragraphs)
    await chapter_repo.mark_chapter_parsed(
        chapter.id,
        seq_start=global_start,
        seq_end=global_start + len(paragraphs) - 1,
        count=len(paragraphs),
    )
    return paragraphs


async def _ensure_chapter_parsed(
    chapter: Chapter,
    book: Book,
    db: AsyncSession,
) -> List[Paragraph]:
    """
    Ensure a chapter's paragraphs exist, parsing lazily if needed.
    Returns all paragraphs for the chapter.
    """
    paragraph_repo = ParagraphRepositoryImpl(db)

    if not chapter.is_parsed:
        await _parse_chapter_content(book.file_path, chapter, book.id, db)

    return await paragraph_repo.get_paragraphs_by_chapter(chapter.id)


async def _get_book_or_404(book_id: int, db: AsyncSession) -> Book:
    """Fetch a book by ID or raise 404."""
    book_repo = BookRepositoryImpl(db)
    book = await book_repo.get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return book


async def _get_chapter_or_404(chapter_id: int, book_id: int, db: AsyncSession) -> Chapter:
    """Fetch a chapter by ID, verifying it belongs to the given book, or raise 404."""
    chapter_repo = ChapterRepositoryImpl(db)
    chapter = await chapter_repo.get_chapter_by_id(chapter_id)
    if chapter is None or chapter.book_id != book_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")
    return chapter


def _chapter_to_response(ch: Chapter) -> ChapterResponse:
    return ChapterResponse(
        id=ch.id, book_id=ch.book_id, title=ch.title,
        spine_index=ch.spine_index, sequence_start=ch.sequence_start,
        sequence_end=ch.sequence_end, paragraph_count=ch.paragraph_count,
        is_parsed=ch.is_parsed, created_at=ch.created_at,
    )


def _paragraph_to_response(p: Paragraph) -> ParagraphResponse:
    return ParagraphResponse(
        id=p.id, book_id=p.book_id, chapter_id=p.chapter_id,
        content=p.content, index=p.index,
        phonetic_transcription=p.phonetic_transcription,
    )


def _strip_html(text: str) -> str:
    """Remove HTML tags, returning plain text."""
    return BeautifulSoup(text, "html.parser").get_text(separator="\n").strip()


# ── Background ──


async def _parse_book_background(
    file_path: str,
    book_id: int,
    db: AsyncSession,
):
    """
    Background task: parse all unparsed chapters of a book one by one.
    Runs after book registration so the user can immediately start reading Chapter 1
    while remaining chapters are processed.
    """
    chapter_repo = ChapterRepositoryImpl(db)
    chapters = await chapter_repo.get_chapters_by_book(book_id)

    for chapter in chapters:
        if chapter.is_parsed:
            continue
        try:
            await _parse_chapter_content(file_path, chapter, book_id, db)
        except Exception:
            logger.warning("Failed to parse chapter %d (spine=%d), skipping", chapter.id, chapter.spine_index)


# ── Endpoints ──


@router.post("/register", response_model=RegisterBookResponse, status_code=status.HTTP_201_CREATED)
async def register_book(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload and register a book (EPUB or PDF).
    - Saves the file to a permanent upload directory
    - Extracts metadata + TOC only (< 1s)
    - Returns immediately with book info and chapter list
    - Chapter 1 gets parsed right away so user can start reading
    - Remaining chapters are parsed in background
    """
    # Validate file extension
    filename = file.filename or "unknown.epub"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in ("epub", "pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format: '{filename}'. Only EPUB (.epub) and PDF (.pdf) files are supported.",
        )

    # Save uploaded file with unique name
    unique_name = f"{uuid.uuid4()}_{filename}"
    file_path = str(UPLOAD_DIR / unique_name)
    content = await file.read()
    Path(file_path).write_bytes(content)
    await file.close()

    parser = _get_parser(file_path)
    book_repo = BookRepositoryImpl(db)
    chapter_repo = ChapterRepositoryImpl(db)
    paragraph_repo = ParagraphRepositoryImpl(db)

    # Step 1: Extract metadata
    try:
        metadata = parser.extract_metadata(file_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read book file: {e}",
        )

    # Step 2: Register book
    book = Book(
        title=metadata["title"], author=metadata["author"],
        file_path=file_path, language=metadata["language"], status="indexed",
    )
    book = await book_repo.add_book(book)

    # Step 3: Extract TOC
    try:
        toc = parser.extract_toc(file_path)
    except Exception:
        toc = []

    # Step 4: Create chapter records
    chapters = [
        Chapter(book_id=book.id, title=ch["title"], spine_index=idx)
        for idx, ch in enumerate(toc)
    ]
    if not chapters:
        chapters = [Chapter(book_id=book.id, title=book.title, spine_index=0)]

    chapters = await chapter_repo.add_chapters(chapters)
    book.total_chapters = len(chapters)
    await book_repo.update_book_status(book.id, "ready")

    # Step 5: Parse Chapter 1 immediately
    if chapters:
        try:
            await _parse_chapter_content(file_path, chapters[0], book.id, db)
        except Exception:
            logger.warning("Failed to parse chapter 1, will be parsed on-demand")

    # Step 6: Schedule background parsing for remaining chapters
    background_tasks.add_task(_parse_book_background, file_path, book.id, db)

    return RegisterBookResponse(
        id=book.id, title=book.title, author=book.author,
        total_chapters=book.total_chapters, language=book.language,
        status=book.status, created_at=book.created_at,
    )


@router.get("", response_model=List[BookListItem])
async def list_books(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all registered books (lightweight)."""
    book_repo = BookRepositoryImpl(db)
    books = await book_repo.get_books_by_user(current_user.id)
    return [
        BookListItem(
            id=b.id, title=b.title, author=b.author,
            total_chapters=b.total_chapters, language=b.language,
            status=b.status, created_at=b.created_at,
        )
        for b in books
    ]


@router.get("/{book_id}", response_model=BookDetailResponse)
async def get_book_detail(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get book details with chapter list."""
    book = await _get_book_or_404(book_id, db)
    chapter_repo = ChapterRepositoryImpl(db)
    chapters = await chapter_repo.get_chapters_by_book(book_id)

    return BookDetailResponse(
        id=book.id, title=book.title, author=book.author,
        file_path=book.file_path, total_chapters=book.total_chapters,
        language=book.language, status=book.status,
        chapters=[_chapter_to_response(ch) for ch in chapters],
        created_at=book.created_at, updated_at=book.updated_at,
    )


@router.get("/{book_id}/chapters", response_model=List[ChapterResponse])
async def get_book_chapters(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all chapters for a book."""
    chapter_repo = ChapterRepositoryImpl(db)
    chapters = await chapter_repo.get_chapters_by_book(book_id)
    return [_chapter_to_response(ch) for ch in chapters]


@router.get("/{book_id}/chapters/{chapter_id}/paragraphs", response_model=List[ParagraphResponse])
async def get_chapter_paragraphs_flat(
    book_id: int,
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get paragraphs for a chapter (flat list).
    If the chapter hasn't been parsed yet, it will be parsed on-demand (lazy parse).
    """
    book = await _get_book_or_404(book_id, db)
    chapter = await _get_chapter_or_404(chapter_id, book_id, db)
    paragraphs = await _ensure_chapter_parsed(chapter, book, db)
    return [_paragraph_to_response(p) for p in paragraphs]


@router.get("/{book_id}/chapters/{chapter_id}", response_model=ChapterParagraphsResponse)
async def get_chapter_paragraphs(
    book_id: int,
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a chapter with its paragraphs.
    If the chapter hasn't been parsed yet, it will be parsed on-demand (lazy parse).
    """
    book = await _get_book_or_404(book_id, db)
    chapter = await _get_chapter_or_404(chapter_id, book_id, db)
    paragraphs = await _ensure_chapter_parsed(chapter, book, db)
    return ChapterParagraphsResponse(
        chapter=_chapter_to_response(chapter),
        paragraphs=[_paragraph_to_response(p) for p in paragraphs],
    )


@router.post("/{book_id}/chapters/{chapter_id}/translate", response_model=TranslatePassageResponse)
async def translate_chapter_passage(
    book_id: int,
    chapter_id: int,
    request: TranslatePassageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Translate a selected passage from the chapter into Georgian,
    with context awareness.

    The endpoint:
    1. Fetches selected paragraphs + surrounding context paragraphs.
    2. Sends the passage + context to an LLM with a literary translation prompt.
    3. Returns the original + translation + context for the frontend to display.
    """
    book = await _get_book_or_404(book_id, db)
    chapter = await _get_chapter_or_404(chapter_id, book_id, db)

    logger.info(
        "translate book_id=%s chapter_id=%s selected=%s left_ctx=%d right_ctx=%d",
        book_id, chapter_id, request.selected_indices,
        request.left_context_count, request.right_context_count,
    )

    # Ensure chapter is parsed and fetch all paragraphs
    all_paragraphs = await _ensure_chapter_parsed(chapter, book, db)

    if not all_paragraphs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chapter has no parsed paragraphs yet.",
        )

    # Build a map from paragraph index -> content for O(1) lookup
    paragraph_map = {p.index: p.content for p in all_paragraphs}
    paragraph_indices = sorted(paragraph_map.keys())

    # Validate selected indices
    selected = sorted(request.selected_indices)
    if not selected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="selected_indices must not be empty",
        )
    invalid = [i for i in selected if i not in paragraph_map]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid paragraph indices: {invalid}. Available indices: {paragraph_indices}",
        )

    # Build passage text (concatenate selected paragraphs)
    passage_parts = [_strip_html(paragraph_map[i]) for i in selected]
    passage = "\n\n".join(passage_parts)

    # Build context windows
    min_selected, max_selected = min(selected), max(selected)
    all_idx_set = set(paragraph_indices)

    left_ctx_indices = []
    ctx_before = min_selected - 1
    for _ in range(request.left_context_count):
        if ctx_before in all_idx_set:
            left_ctx_indices.append(ctx_before)
            ctx_before -= 1
        else:
            break
    left_ctx_indices.reverse()

    right_ctx_indices = []
    ctx_after = max_selected + 1
    for _ in range(request.right_context_count):
        if ctx_after in all_idx_set:
            right_ctx_indices.append(ctx_after)
            ctx_after += 1
        else:
            break

    left_context = "\n\n".join(_strip_html(paragraph_map[i]) for i in left_ctx_indices)
    right_context = "\n\n".join(_strip_html(paragraph_map[i]) for i in right_ctx_indices)

    # Call translation service
    translator = TranslationService()
    try:
        translation = await translator.translate(
            passage,
            left_context=left_context,
            right_context=right_context,
            book_title=book.title,
            source_language=request.source_language,
            provider=request.provider,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Translation failed: {e}",
        )

    return TranslatePassageResponse(
        original=passage,
        translation=translation,
        left_context=left_context,
        right_context=right_context,
    )


@router.get("/{book_id}/file")
async def get_book_file(
    book_id: int,
    token: str = "",
    db: AsyncSession = Depends(get_db),
    blacklist: TokenBlacklistService = Depends(TokenBlacklistService),
):
    """
    Serve the original PDF file for client-side rendering with PDF.js.

    Authentication is handled via the ``token`` query parameter because
    PDF.js's getDocument() cannot easily set custom HTTP headers.
    The token is validated (decoded + blacklist check) to ensure the
    user is authenticated.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated — token query parameter is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = jwt.decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    jti = payload.get("jti")
    if jti is not None:
        is_blacklisted = await blacklist.is_blacklisted(jti)
        if is_blacklisted:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user_repo = UserRepositoryImpl(db)
    user = await user_repo.get_by_id(int(user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    book = await _get_book_or_404(book_id, db)
    if not os.path.exists(book.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")
    return FileResponse(book.file_path, media_type="application/pdf")


@router.post("/{book_id}/translate-text", response_model=TranslateTextResponse)
async def translate_selected_text(
    book_id: int,
    request: TranslateTextRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Translate arbitrary text selected by the user (word, phrase, or paragraph).
    Uses surrounding text as context for better literary translation quality.
    """
    book = await _get_book_or_404(book_id, db)
    translator = TranslationService()
    try:
        translation = await translator.translate(
            request.selected_text,
            left_context=request.left_context,
            right_context=request.right_context,
            book_title=book.title,
            source_language=request.source_language,
            provider=request.provider,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Translation failed: {e}",
        )
    return TranslateTextResponse(original=request.selected_text, translation=translation)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a book and all its associated data (chapters, paragraphs, and uploaded file)."""
    book_repo = BookRepositoryImpl(db)
    book = await book_repo.get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    file_path = await book_repo.delete_book(book_id)
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            logger.warning("Could not delete file on disk: %s", file_path)