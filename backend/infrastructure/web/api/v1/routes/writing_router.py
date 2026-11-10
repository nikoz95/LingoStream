"""Routes for the Writing & Speaking Studio."""
import json
import logging

from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import settings
from infrastructure.ai import translation_service as ts
from infrastructure.ai import writing_service as ws
from infrastructure.database.postgres.models import WritingSubmission
from infrastructure.database.postgres.session import get_session
from infrastructure.web.api.v1.dependencies import AuthenticatedUser, authenticate_request
from infrastructure.web.api.v1.schemas.book_schemas import TranslateWordResponse
from infrastructure.web.api.v1.schemas.writing_schemas import (
    DeepDiveExplainRequest,
    DeepDiveExplainResponse,
    EvaluateWritingRequest,
    EvaluateWritingResponse,
    PatternAnalysisResponse,
    WritingChatRequest,
    WritingChatResponse,
    WritingSubmissionItem,
    WritingSubmissionListResponse,
    WritingTranslateWordRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _orm_to_submission_item(row: WritingSubmission) -> WritingSubmissionItem:
    """Convert a WritingSubmission ORM row into a WritingSubmissionItem schema."""
    try:
        corrections = json.loads(row.corrections_json or "[]")
    except Exception:
        corrections = []
    try:
        suggested_words = json.loads(row.suggested_words_json or "[]")
    except Exception:
        suggested_words = []
    try:
        speaking_connectors = json.loads(row.speaking_connectors_json or "[]")
    except Exception:
        speaking_connectors = []

    return WritingSubmissionItem(
        id=row.id,
        topic=row.topic or "",
        original_text=row.original_text,
        corrected_text=row.corrected_text,
        natural_spoken_text=row.natural_spoken_text,
        elevated_text=row.elevated_text,
        cefr_level=row.cefr_level or "B1",
        overall_feedback=row.overall_feedback or "",
        speaking_connectors=speaking_connectors,
        corrections=corrections,
        suggested_words=suggested_words,
        created_at=row.created_at,
    )


@router.post(
    "/evaluate",
    response_model=EvaluateWritingResponse,
    summary="Evaluate user writing, persist submission, and return feedback",
)
async def evaluate_user_writing(
    body: EvaluateWritingRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
    x_custom_provider: Optional[str] = Header(None),
    x_custom_model: Optional[str] = Header(None),
    x_custom_api_key: Optional[str] = Header(None),
    x_custom_base_url: Optional[str] = Header(None),
):
    """Analyze free writing (including mixed Georgian/English), save it to DB, and return structured feedback."""
    effective_provider = body.provider or x_custom_provider
    try:
        result = await ws.evaluate_writing(
            text=body.text,
            topic=body.topic or "",
            target_language=body.target_language,
            native_language=body.native_language,
            provider=effective_provider,
            api_key_override=x_custom_api_key,
            model_override=x_custom_model,
            base_url_override=x_custom_base_url,
        )

        submission = WritingSubmission(
            user_id=auth.user.id,
            topic=(body.topic or "").strip() or None,
            original_text=body.text,
            corrected_text=result.get("corrected_text", body.text),
            natural_spoken_text=result.get("natural_spoken_text", body.text),
            elevated_text=result.get("elevated_text", body.text),
            cefr_level=result.get("cefr_level", "B1"),
            overall_feedback=result.get("overall_feedback", ""),
            corrections_json=json.dumps(result.get("corrections", []), ensure_ascii=False),
            suggested_words_json=json.dumps(result.get("suggested_words", []), ensure_ascii=False),
            speaking_connectors_json=json.dumps(result.get("speaking_connectors", []), ensure_ascii=False),
        )
        db.add(submission)
        await db.commit()
        await db.refresh(submission)

        return EvaluateWritingResponse(submission_id=submission.id, **result)
    except ts.TranslationError as exc:
        logger.exception("Writing evaluation failed for user=%d", auth.user.id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/submissions",
    response_model=WritingSubmissionListResponse,
    summary="List saved writing submissions for the authenticated user",
)
async def list_writing_submissions(
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """Return all saved writing submissions ordered newest first."""
    stmt = (
        select(WritingSubmission)
        .where(WritingSubmission.user_id == auth.user.id)
        .order_by(desc(WritingSubmission.created_at))
        .limit(50)
    )
    res = await db.execute(stmt)
    rows = res.scalars().all()
    items = [_orm_to_submission_item(r) for r in rows]
    return WritingSubmissionListResponse(submissions=items, total=len(items))


@router.delete(
    "/submissions/{submission_id}",
    status_code=204,
    summary="Delete a saved writing submission",
)
async def delete_writing_submission(
    submission_id: int,
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """Delete a specific writing submission belonging to the authenticated user."""
    stmt = select(WritingSubmission).where(
        WritingSubmission.id == submission_id,
        WritingSubmission.user_id == auth.user.id,
    )
    res = await db.execute(stmt)
    row = res.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    await db.delete(row)
    await db.commit()


@router.post(
    "/analyze-patterns",
    response_model=PatternAnalysisResponse,
    summary="Analyze common mistake patterns across user's saved writings and generate micro-drills",
)
async def analyze_user_writing_patterns(
    auth: AuthenticatedUser = Depends(authenticate_request),
    db: AsyncSession = Depends(get_session),
):
    """Inspect recent saved writing submissions to extract recurring weak spots, golden rules, and drills."""
    stmt = (
        select(WritingSubmission)
        .where(WritingSubmission.user_id == auth.user.id)
        .order_by(desc(WritingSubmission.created_at))
        .limit(15)
    )
    res = await db.execute(stmt)
    rows = res.scalars().all()
    if not rows:
        raise HTTPException(status_code=400, detail="ჯერ არ გაქვს შენახული თემები ანალიზისთვის.")

    summary_payload = []
    for r in reversed(rows):
        try:
            corrs = json.loads(r.corrections_json or "[]")
        except Exception:
            corrs = []
        summary_payload.append(
            {
                "date": r.created_at.isoformat() if r.created_at else "",
                "topic": r.topic or "",
                "cefr_level": r.cefr_level,
                "original_text": r.original_text[:600],
                "corrections": corrs,
            }
        )

    try:
        result = await ws.analyze_writing_patterns(summary_payload)
        return PatternAnalysisResponse(**result)
    except ts.TranslationError as exc:
        logger.exception("Writing pattern analysis failed for user=%d", auth.user.id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/chat",
    response_model=WritingChatResponse,
    summary="Interactive roleplay & conversation turn with coaching feedback",
)
async def writing_chat_turn(
    body: WritingChatRequest,
    auth: AuthenticatedUser = Depends(authenticate_request),
    x_custom_provider: Optional[str] = Header(None),
    x_custom_model: Optional[str] = Header(None),
    x_custom_api_key: Optional[str] = Header(None),
    x_custom_base_url: Optional[str] = Header(None),
):
    """Process a turn in an interactive conversation/roleplay and return reply + feedback."""
    effective_provider = body.provider or x_custom_provider
    try:
        history = [{"role": m.role, "content": m.content} for m in body.messages]
        result = await ws.chat_turn(
            messages_history=history,
            scenario=body.scenario,
            target_language=body.target_language,
            native_language=body.native_language,
            provider=effective_provider,
            api_key_override=x_custom_api_key,
            model_override=x_custom_model,
            base_url_override=x_custom_base_url,
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
    x_custom_provider: Optional[str] = Header(None),
    x_custom_model: Optional[str] = Header(None),
    x_custom_api_key: Optional[str] = Header(None),
    x_custom_base_url: Optional[str] = Header(None),
):
    """Answer 'Why?' / 'ჩაეძიე' questions about a specific grammar or phrasing correction."""
    effective_provider = body.provider or x_custom_provider
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
            provider=effective_provider,
            api_key_override=x_custom_api_key,
            model_override=x_custom_model,
            base_url_override=x_custom_base_url,
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
    x_custom_provider: Optional[str] = Header(None),
    x_custom_model: Optional[str] = Header(None),
    x_custom_api_key: Optional[str] = Header(None),
    x_custom_base_url: Optional[str] = Header(None),
):
    """Look up a single word or short phrase from the Writing Studio for saving to Vocabulary."""
    effective_provider = body.provider or x_custom_provider
    try:
        result = await ts.translate_word(
            word=body.word,
            left_context=body.sentence_context or "",
            right_context="",
            book_title="Writing Studio",
            source_language=body.source_language,
            target_language=body.target_language,
            provider=effective_provider,
            api_key_override=x_custom_api_key,
            model_override=x_custom_model,
            base_url_override=x_custom_base_url,
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
