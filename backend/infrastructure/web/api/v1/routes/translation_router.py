"""Translation routes: translate passage, translate arbitrary text."""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from infrastructure.ai.translation_service import TranslationService
from infrastructure.database.postgres.repositories import (
    BookRepositoryImpl,
    ParagraphRepositoryImpl,
)
from infrastructure.database.postgres.session import get_session
from infrastructure.web.api.v1.dependencies import get_current_user
from infrastructure.web.api.v1.schemas.book_schemas import (
    TranslatePassageRequest,
    TranslatePassageResponse,
    TranslateTextRequest,
    TranslateTextResponse,
)
from domain.entities.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


def get_translation_service() -> TranslationService:
    """Return a singleton TranslationService instance."""
    from infrastructure.web.api.v1.app import translation_service
    return translation_service


@router.post(
    "/{book_id}/chapters/{chapter_id}/translate",
    response_model=TranslatePassageResponse,
)
async def translate_passage(
    book_id: int,
    chapter_id: int,
    request: TranslatePassageRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Translate a passage (selected paragraph indices) within a chapter."""
    para_repo = ParagraphRepositoryImpl(db)
    all_paragraphs = await para_repo.get_paragraphs_by_chapter(chapter_id)
    index_map = {p.index: p.content for p in all_paragraphs}
    selected_indices = sorted(request.selected_indices)

    if not selected_indices:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No paragraph indices provided",
        )

    # Build passage from selected indices
    passage_parts = []
    for idx in selected_indices:
        content = index_map.get(idx)
        if content is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Paragraph index {idx} not found in chapter {chapter_id}",
            )
        passage_parts.append(content)
    passage = "\n\n".join(passage_parts)

    # Build left/right context
    min_idx = min(selected_indices)
    max_idx = max(selected_indices)

    left_parts = []
    for n in range(1, request.left_context_count + 1):
        ctx = index_map.get(min_idx - n)
        if ctx:
            left_parts.append(ctx)
    left_context = "\n\n".join(reversed(left_parts))

    right_parts = []
    for n in range(1, request.right_context_count + 1):
        ctx = index_map.get(max_idx + n)
        if ctx:
            right_parts.append(ctx)
    right_context = "\n\n".join(right_parts)

    # Fetch book title for context
    book_repo = BookRepositoryImpl(db)
    book = await book_repo.get_book_by_id(book_id)
    book_title = book.title if book else ""

    # Translate
    translation_service = get_translation_service()
    try:
        translation = await translation_service.translate(
            passage,
            left_context=left_context,
            right_context=right_context,
            book_title=book_title,
            source_language=request.source_language,
            provider=request.provider,
        )
    except Exception as exc:
        logger.error("Translation failed for book=%d chapter=%d: %s", book_id, chapter_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Translation failed: {exc}",
        )

    return TranslatePassageResponse(
        original=passage,
        translation=translation,
        left_context=left_context,
        right_context=right_context,
    )


@router.post(
    "/{book_id}/translate-text",
    response_model=TranslateTextResponse,
)
async def translate_text(
    book_id: int,
    request: TranslateTextRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Translate arbitrary text selection with surrounding context."""
    if not request.selected_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No text provided",
        )

    translation_service = get_translation_service()
    try:
        translation = await translation_service.translate(
            request.selected_text,
            left_context=request.left_context,
            right_context=request.right_context,
            book_title=request.book_title,
            source_language=request.source_language,
            provider=request.provider,
        )
    except Exception as exc:
        logger.error("Text translation failed for book=%d: %s", book_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Translation failed: {exc}",
        )

    return TranslateTextResponse(
        original=request.selected_text,
        translation=translation,
    )