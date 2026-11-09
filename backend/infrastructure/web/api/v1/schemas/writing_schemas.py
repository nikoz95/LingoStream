"""Pydantic schemas for the Writing & Speaking Studio endpoints."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class SuggestedWordItem(BaseModel):
    word: str
    phonetic: Optional[str] = ""
    translation: Optional[str] = ""
    definition: Optional[str] = ""
    sentence_context: Optional[str] = ""
    sentence_context_translated: Optional[str] = ""


class CorrectionItem(BaseModel):
    original: str
    corrected: str
    type: str = "grammar"
    short_explanation: str = ""


class SpeakingConnectorItem(BaseModel):
    phrase: str
    meaning: str = ""
    example: str = ""


class EvaluateWritingRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    topic: Optional[str] = ""
    target_language: str = "en"
    native_language: str = "ka"
    provider: Optional[str] = None


class EvaluateWritingResponse(BaseModel):
    submission_id: Optional[int] = None
    corrected_text: str
    natural_spoken_text: str
    elevated_text: str
    cefr_level: str = "B1"
    overall_feedback: str = ""
    speaking_connectors: List[SpeakingConnectorItem] = []
    corrections: List[CorrectionItem] = []
    suggested_words: List[SuggestedWordItem] = []


class WritingSubmissionItem(BaseModel):
    id: int
    topic: Optional[str] = ""
    original_text: str
    corrected_text: str
    natural_spoken_text: str
    elevated_text: str
    cefr_level: str = "B1"
    overall_feedback: str = ""
    speaking_connectors: List[SpeakingConnectorItem] = []
    corrections: List[CorrectionItem] = []
    suggested_words: List[SuggestedWordItem] = []
    created_at: Optional[datetime] = None


class WritingSubmissionListResponse(BaseModel):
    submissions: List[WritingSubmissionItem]
    total: int


class UserExamplePair(BaseModel):
    wrong: str
    right: str


class MicroDrillItem(BaseModel):
    prompt_ka: str
    hint: Optional[str] = ""
    correct_answer: str
    explanation_ka: Optional[str] = ""


class WeakSpotItem(BaseModel):
    category: str
    frequency_label: Optional[str] = ""
    why_it_happens: str = ""
    golden_rule: str = ""
    user_examples: List[UserExamplePair] = []
    drills: List[MicroDrillItem] = []


class PatternAnalysisResponse(BaseModel):
    overall_summary: str
    level_trend: str = "B1"
    weak_spots: List[WeakSpotItem] = []


class ChatMessageItem(BaseModel):
    role: str
    content: str


class ChatUserFeedback(BaseModel):
    is_perfect: bool = False
    corrected: str = ""
    natural_alternative: str = ""
    short_explanation: str = ""
    corrections: List[CorrectionItem] = []
    suggested_words: List[SuggestedWordItem] = []


class WritingChatRequest(BaseModel):
    messages: List[ChatMessageItem] = []
    scenario: str = "Free conversation on any interesting topic"
    target_language: str = "en"
    native_language: str = "ka"
    provider: Optional[str] = None


class WritingChatResponse(BaseModel):
    reply: str
    reply_translation: str = ""
    user_feedback: Optional[ChatUserFeedback] = None


class DeepDiveExampleItem(BaseModel):
    correct: str
    translation: str = ""
    wrong_variant: Optional[str] = ""


class DeepDiveExplainRequest(BaseModel):
    original_text: str
    corrected_text: str
    context_sentence: Optional[str] = ""
    question: Optional[str] = ""
    history: List[ChatMessageItem] = []
    target_language: str = "en"
    native_language: str = "ka"
    provider: Optional[str] = None


class DeepDiveExplainResponse(BaseModel):
    answer: str
    grammar_rule_title: str = ""
    examples: List[DeepDiveExampleItem] = []
    suggested_words: List[SuggestedWordItem] = []


class WritingTranslateWordRequest(BaseModel):
    word: str = Field(..., min_length=1, max_length=300)
    sentence_context: Optional[str] = ""
    source_language: str = "en"
    target_language: str = "ka"
    provider: Optional[str] = None
