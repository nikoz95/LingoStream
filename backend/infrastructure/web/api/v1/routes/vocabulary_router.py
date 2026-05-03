"""Routes for managing user vocabulary words."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from infrastructure.database.postgres.session import get_session
from infrastructure.database.postgres.repositories import (
    BookRepositoryImpl,
    VocabularyRepositoryImpl,
)
from infrastructure.web.api.v1.dependencies import authenticate_request, AuthenticatedUser
from infrastructure.web.api.v1.schemas.book_schemas import (
    CreateVocabularyWordRequest,
    UpdateVocabularyWordRequest,
    VocabularyWordSchema,
    VocabularyListResponse,
    VocabularyCheckResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/words",
    response_model=VocabularyWordSchema,
    summary="Save a vocabulary word",
)
async def create_vocabulary_word(
    body: CreateVocabularyWordRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """Save a new vocabulary word for the authenticated user."""
    vocab_repo = VocabularyRepositoryImpl(db)

    # Verify book ownership if book_id is provided
    if body.book_id is not None:
        book_repo = BookRepositoryImpl(db)
        book = await book_repo.get_book_by_id(body.book_id)
        if book is None or book.user_id != auth.user.id:
            raise HTTPException(status_code=404, detail="Book not found")

    vocab_orm = await vocab_repo.add(
        user_id=auth.user.id,
        word=body.word,
        phonetic=body.phonetic,
        definition=body.definition,
        sentence_context=body.sentence_context,
        sentence_context_translated=body.sentence_context_translated,
        translation=body.translation,
        book_id=body.book_id,
    )

    return VocabularyWordSchema.model_validate(vocab_orm)


@router.get(
    "/words",
    response_model=VocabularyListResponse,
    summary="List all vocabulary words",
)
async def list_vocabulary_words(
    book_id: int | None = None,
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """List all vocabulary words for the authenticated user, optionally filtered by book."""
    vocab_repo = VocabularyRepositoryImpl(db)

    if book_id is not None:
        words = await vocab_repo.list_by_book(auth.user.id, book_id)
    else:
        words = await vocab_repo.list_by_user(auth.user.id)

    schemas = [VocabularyWordSchema.model_validate(w) for w in words]
    return VocabularyListResponse(words=schemas, total=len(schemas))


@router.get(
    "/words/check",
    response_model=VocabularyCheckResponse,
    summary="Check if a word exists in vocabulary",
)
async def check_vocabulary_word(
    word: str,
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """Check if a word already exists in the user's vocabulary."""
    vocab_repo = VocabularyRepositoryImpl(db)
    existing = await vocab_repo.find_by_word(auth.user.id, word.strip())

    if existing is None:
        return VocabularyCheckResponse(exists=False, word=None)

    return VocabularyCheckResponse(
        exists=True,
        word=VocabularyWordSchema.model_validate(existing),
    )


@router.put(
    "/words/{word_id}",
    response_model=VocabularyWordSchema,
    summary="Update a vocabulary word",
)
async def update_vocabulary_word(
    word_id: int,
    body: UpdateVocabularyWordRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """Update specific fields of a vocabulary word."""
    vocab_repo = VocabularyRepositoryImpl(db)

    # Verify ownership
    word = await vocab_repo.get_by_id(word_id)
    if word is None or word.user_id != auth.user.id:
        raise HTTPException(status_code=404, detail="Vocabulary word not found")

    # Build update dict with only provided fields
    update_fields = {}
    for field in ("word", "phonetic", "definition", "sentence_context",
                  "sentence_context_translated", "translation", "book_id"):
        val = getattr(body, field, None)
        if val is not None:
            update_fields[field] = val

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Verify book ownership if book_id is being changed
    if "book_id" in update_fields and update_fields["book_id"] is not None:
        book_repo = BookRepositoryImpl(db)
        book = await book_repo.get_book_by_id(update_fields["book_id"])
        if book is None or book.user_id != auth.user.id:
            raise HTTPException(status_code=404, detail="Book not found")

    updated = await vocab_repo.update_word(word_id, **update_fields)
    if not updated:
        raise HTTPException(status_code=404, detail="Vocabulary word not found")

    # Re-fetch the updated word
    updated_word = await vocab_repo.get_by_id(word_id)
    return VocabularyWordSchema.model_validate(updated_word)


@router.delete(
    "/words/{word_id}",
    status_code=204,
    summary="Delete a vocabulary word",
)
async def delete_vocabulary_word(
    word_id: int,
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """Delete a vocabulary word by its ID."""
    vocab_repo = VocabularyRepositoryImpl(db)

    # Verify ownership
    word = await vocab_repo.get_by_id(word_id)
    if word is None or word.user_id != auth.user.id:
        raise HTTPException(status_code=404, detail="Vocabulary word not found")

    deleted = await vocab_repo.delete(word_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Vocabulary word not found")