"""Routes for the Writing & Speaking Studio."""
import logging

from fastapi import APIRouter, Depends, HTTPException

from config.settings import settings
from infrastructure.ai import translation_service as ts
from infrastructure.ai import writing_service as ws
from infrastructure.web.api.v1.dependencies import AuthenticatedUser, authenticate_request
from infrastructure.web.api.v1.schemas.book_schemas import TranslateWordResponse
from infrastructure.web.api.v1.schemas.writing_schemas import (
    DeepDiveExplainRequest,
    DeepDiveExplainResponse,
    EvaluateWritingRequest,
    EvaluateWritingResponse,
    WritingChatRequest,
    WritingChatResponse,
    WritingTranslateWordRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/evaluate",
    response_model=EvaluateWritingResponse,
    summary="Evaluate user writing with multi-level rewrites, corrections, and vocabulary",
)
async def evaluate_user_writing(
    body: EvaluateWritingRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
):
    """Analyze free writing (including mixed Georgian/English) and return structured feedback."""
    try:
        result = await ws.evaluate_writing(
            text=body.text,
            topic=body.topic or "",
            target_language=body.target_language,
            native_language=body.native_language,
            provider=body.provider,
        )
        return EvaluateWritingResponse(**result)
    except ts.TranslationError as exc:
        logger.exception("Writing evaluation failed for user=%d", auth.user.id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/chat",
    response_model=WritingChatResponse,
    summary="Interactive roleplay & conversation turn with coaching feedback",
)
async def writing_chat_turn(
    body: WritingChatRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
):
    """Process a turn in an interactive conversation/roleplay and return reply + feedback."""
    try:
        history = [{"role": m.role, "content": m.content} for m in body.messages]
        result = await ws.chat_turn(
            messages_history=history,
            scenario=body.scenario,
            target_language=body.target_language,
            native_language=body.native_language,
            provider=body.provider,
        )
        return WritingChatResponse(**result)
    except ts.TranslationError as exc:
        logger.exception("Writing chat failed for user=%d", auth.user.id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/explain",
    response_model=DeepDiveExplainResponse,
    summary="Deep-dive grammar & nuance explanation for a specific correction or phrase",
)
async def explain_correction_deep_dive(
    body: DeepDiveExplainRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
):
    """Answer 'Why?' / 'ჩაეძიე' questions about a specific grammar or phrasing correction."""
    try:
        history = [{"role": m.role, "content": m.content} for m in body.history]
        result = await ws.explain_deep_dive(
            original_text=body.original_text,
            corrected_text=body.corrected_text,
            context_sentence=body.context_sentence or "",
            question=body.question or "",
            history=history,
            target_language=body.target_language,
            native_language=body.native_language,
            provider=body.provider,
        )
        return DeepDiveExplainResponse(**result)
    except ts.TranslationError as exc:
        logger.exception("Writing deep-dive explain failed for user=%d", auth.user.id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/translate-word",
    response_model=TranslateWordResponse,
    summary="Translate a word or phrase inside the Writing Studio without needing a book",
)
async def translate_writing_word(
    body: WritingTranslateWordRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
):
    """Look up a single word or short phrase from the Writing Studio for saving to Vocabulary."""
    try:
        result = await ts.translate_word(
            word=body.word,
            left_context=body.sentence_context or "",
            right_context="",
            book_title="Writing Studio",
            source_language=body.source_language,
            target_language=body.target_language,
            provider=body.provider,
        )
        lemma = result.get("lemma", "").strip() or result.get("word", body.word)
        return TranslateWordResponse(
            word=lemma,
            translation=result.get("translation", ""),
            phonetic=result.get("phonetic", ""),
            definition=result.get("definition", ""),
            sentence_context=result.get("sentence_context", ""),
            sentence_context_translated=result.get("sentence_context_translated", ""),
            provider=body.provider or settings.LLM_PROVIDER,
        )
    except ts.TranslationError as exc:
        logger.exception("Writing word lookup failed for user=%d", auth.user.id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
