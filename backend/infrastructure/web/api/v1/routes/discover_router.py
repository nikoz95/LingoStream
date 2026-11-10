"""Routes for Content Discovery, Level Adaptation (A2-C1), Podcast Dialogues & Short Stories."""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from domain.entities.book import Book, Chapter
from domain.entities.user import User
from infrastructure.ai.discover_service import (
    build_chapters_for_import,
    build_epub_bytes,
    fetch_discover_feed,
    resolve_full_content,
)
from infrastructure.database.postgres.repositories import (
    BookRepositoryImpl,
    ChapterRepositoryImpl,
)
from infrastructure.database.postgres.session import get_session
from infrastructure.storage.storage_service import storage_service
from infrastructure.web.api.v1.dependencies import get_current_user
from infrastructure.web.api.v1.schemas.book_schemas import RegisterBookResponse
from infrastructure.web.api.v1.schemas.discover_schemas import (
    DiscoverFeedItem,
    DiscoverFeedResponse,
    DiscoverImportRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/feed", response_model=DiscoverFeedResponse)
async def get_discover_feed(
    category: str = Query("ai", description="Feed category (ai, dotnet, python, architecture, world, psychology, science, culture, podcasts, stories)"),
    current_user: User = Depends(get_current_user),
):
    """Fetch live articles, discussions, or short story prompts for the selected category."""
    items_raw = await fetch_discover_feed(category)
    items = [DiscoverFeedItem(**item) for item in items_raw]
    return DiscoverFeedResponse(category=category, items=items)


@router.post("/import", response_model=RegisterBookResponse, status_code=status.HTTP_201_CREATED)
async def import_discover_item(
    payload: DiscoverImportRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Import a feed item or custom topic into the user's library as a clean EPUB book.
    Supports modes:
    - 'original': Read original article text
    - 'adapted': Adapt article to CEFR level (A2, B1, B2, C1)
    - 'podcast': Convert into a 2-host spoken podcast conversation at CEFR level
    - 'story': Generate or adapt a modern short story at CEFR level
    """
    try:
        full_text = await resolve_full_content(
            item_id=payload.item_id,
            title=payload.title,
            summary=payload.summary,
            raw_content=payload.raw_content,
        )

        final_title, chapters_data = await build_chapters_for_import(
            title=payload.title,
            summary=payload.summary,
            full_text=full_text,
            mode=payload.mode,
            cefr_level=payload.cefr_level,
            include_original_chapter=payload.include_original_chapter,
            provider=payload.provider,
        )

        author_label = payload.author or payload.source_name or "LingoStream Discover"
        epub_bytes = build_epub_bytes(
            title=final_title,
            author=author_label,
            chapters_data=chapters_data,
        )

        file_id = uuid.uuid4().hex
        epub_key = f"books/{current_user.id}/{file_id}.epub"
        storage_service.upload_bytes(epub_bytes, epub_key, "application/epub+zip")

        book = Book(
            user_id=current_user.id,
            title=final_title,
            author=author_label,
            file_path=epub_key,
            total_chapters=len(chapters_data),
            total_pages=0,
            language="en",
            status="ready",
        )
        book_repo = BookRepositoryImpl(db)
        book = await book_repo.add_book(book)

        chapter_entities = [
            Chapter(
                book_id=book.id,
                title=ch_title,
                spine_index=idx,
                is_parsed=True,
            )
            for idx, (ch_title, _) in enumerate(chapters_data)
        ]
        chapter_repo = ChapterRepositoryImpl(db)
        await chapter_repo.add_chapters(chapter_entities)

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
    except Exception as exc:
        logger.error("Failed to import discover item '%s': %s", payload.title, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to prepare reading material: {exc}",
        ) from exc
