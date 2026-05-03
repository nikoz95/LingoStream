"""Routes for translating text passages via AI providers."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import settings
from infrastructure.database.postgres.session import get_session
from infrastructure.database.postgres.repositories import (
    BookRepositoryImpl,
    ParagraphRepositoryImpl,
)
from infrastructure.web.api.v1.dependencies import authenticate_request, AuthenticatedUser
from infrastructure.web.api.v1.schemas.book_schemas import (
    TranslatePassageRequest,
    TranslatePassageResponse,
    TranslateTextRequest,
    TranslateTextResponse,
    TranslateWordRequest,
    TranslateWordResponse,
)
from infrastructure.ai import translation_service as ts

logger = logging.getLogger(__name__)

router = APIRouter()


async def _verify_book_ownership(
    book_id: int, auth_user_id: int, db: AsyncSession
) -> None:
    """Verify the book exists and belongs to the authenticated user."""
    repo = BookRepositoryImpl(db)
    book = await repo.get_book_by_id(book_id)
    if book is None or book.user_id != auth_user_id:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.post(
    "/{book_id}/chapters/{chapter_id}/translate",
    response_model=TranslatePassageResponse,
    summary="Translate a passage from a book chapter",
)
async def translate_passage(
    book_id: int,
    chapter_id: int,
    body: TranslatePassageRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """Translate a selected passage from a chapter using the chosen AI provider."""
    book = await _verify_book_ownership(book_id, auth.user.id, db)
    paragraph_repo = ParagraphRepositoryImpl(db)

    all_paragraphs = await paragraph_repo.get_paragraphs_by_chapter(chapter_id)
    if not all_paragraphs:
        raise HTTPException(status_code=404, detail="No paragraphs found in chapter")

    context_window = body.context_window or 2
    indices = body.paragraph_indices

    passage_texts = [
        p.content for p in all_paragraphs if p.index in indices
    ]
    passage = " ".join(passage_texts) if passage_texts else ""

    if not passage:
        raise HTTPException(status_code=400, detail="No valid paragraphs for given indices")

    min_idx, max_idx = min(indices), max(indices)
    left = "\n".join(p.content for p in all_paragraphs if min_idx - context_window <= p.index < min_idx)
    right = "\n".join(p.content for p in all_paragraphs if max_idx < p.index <= max_idx + context_window)

    try:
        translation = await ts.translate(
            passage=passage,
            left_context=left,
            right_context=right,
            book_title=book.title,
            source_language=book.language,
            provider=body.provider,
        )
    except ts.TranslationError:
        logger.exception("Translation failed for book=%d chapter=%d", book_id, chapter_id)
        raise HTTPException(status_code=502, detail="Translation failed")

    return TranslatePassageResponse(
        passage=passage,
        translation=translation,
        provider=body.provider or settings.LLM_PROVIDER,
    )


@router.post(
    "/{book_id}/translate-text",
    response_model=TranslateTextResponse,
    summary="Translate arbitrary text selection from a book",
)
async def translate_text(
    book_id: int,
    body: TranslateTextRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """Translate arbitrary selected text from a book (no chapter DB lookup needed)."""
    book = await _verify_book_ownership(book_id, auth.user.id, db)

    try:
        translation = await ts.translate(
            passage=body.text,
            left_context="",
            right_context="",
            book_title=book.title,
            source_language=body.language or book.language,
            provider=body.provider,
        )
    except ts.TranslationError:
        logger.exception("Translation failed for book=%d (free text)", book_id)
        raise HTTPException(status_code=502, detail="Translation failed")

    return TranslateTextResponse(
        source_text=body.text,
        translated_text=translation,
        provider=body.provider or settings.LLM_PROVIDER,
    )


@router.post(
    "/{book_id}/translate-word",
    response_model=TranslateWordResponse,
    summary="Translate a single word with phonetic, definition, and sentence context",
)
async def translate_word_endpoint(
    book_id: int,
    body: TranslateWordRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """Translate a single word to Georgian with phonetic, definition, sentence context."""
    book = await _verify_book_ownership(book_id, auth.user.id, db)

    try:
        result = await ts.translate_word(
            word=body.word,
            left_context=body.left_context,
            right_context=body.right_context,
            book_title=body.book_title or book.title,
            source_language=body.source_language or book.language,
            provider=body.provider,
        )
    except ts.TranslationError:
        logger.exception("Word translation failed for book=%d word=%s", book_id, body.word)
        raise HTTPException(status_code=502, detail="Translation failed")

    return TranslateWordResponse(
        word=body.word,
        translation=result.get("translation", ""),
        phonetic=result.get("phonetic", ""),
        definition=result.get("definition", ""),
        sentence_context=result.get("sentence_context", ""),
        sentence_context_translated=result.get("sentence_context_translated", ""),
        provider=body.provider or settings.LLM_PROVIDER,
    )
