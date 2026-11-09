"""
Writing & Speaking Coach AI Service.

Provides:
1. Free-writing evaluation (supports mixed Georgian/English input, 3-tier rewrites,
   detailed corrections, and vocabulary extraction).
2. Interactive roleplay/conversation chat with live non-intrusive feedback.
3. Contextual Deep-Dive ("რატომ? / ჩაეძიე") grammar & nuance explanations on any
   specific correction or phrase.
"""
import json
import logging
from typing import Any, Dict, List, Optional

import httpx
from openai import AsyncOpenAI

from config.settings import settings
from infrastructure.ai.translation_service import (
    TranslationError,
    _clean_translation,
    _fallback_models_for,
    _resolve_lang_name,
    _resolve_provider,
)

logger = logging.getLogger(__name__)


EVALUATE_SYSTEM_PROMPT = """You are an expert, encouraging {target_language} writing and speaking coach for a native {native_language} speaker.
The user is writing a text in {target_language}. Sometimes, when they don't know a word or phrase, they may write parts of the sentence in {native_language} (mixed language input).

Analyze the user's text and return ONLY a valid raw JSON object (no markdown fences) with this exact structure:
{{
  "corrected_text": "<The user's text in {target_language} with all grammar/spelling mistakes fixed, and any {native_language} words/phrases naturally translated into {target_language}>",
  "natural_spoken_text": "<How a native {target_language} speaker would naturally express this exact same thought in casual, everyday spoken conversation>",
  "elevated_text": "<A more articulate, polished, and expressive version in {target_language}>",
  "cefr_level": "<Estimated CEFR level of the user's writing, e.g. A2, B1, B2, C1>",
  "overall_feedback": "<2-3 sentences of warm, constructive feedback in {native_language} highlighting what was good and what to focus on>",
  "speaking_connectors": [
    {{
      "phrase": "<Natural spoken connector/transition in {target_language} that fits this text, e.g. 'The thing is...', 'What struck me most was...'>",
      "meaning": "<Meaning and usage note in {native_language}>",
      "example": "<Example sentence in {target_language} using this connector>"
    }}
  ],
  "corrections": [
    {{
      "original": "<The exact word/phrase/clause from the user's input that had an issue or was written in {native_language}>",
      "corrected": "<The corrected or translated {target_language} phrase>",
      "type": "<grammar | mixed_translation | natural_phrasing | vocabulary | spelling>",
      "short_explanation": "<Clear 1-2 sentence explanation in {native_language} of why this change was made>"
    }}
  ],
  "suggested_words": [
    {{
      "word": "<Useful word or idiom in {target_language} from the corrected/natural versions>",
      "phonetic": "<word / phonetic or IPA pronunciation>",
      "translation": "<{native_language} translation>",
      "definition": "<Brief explanation in {native_language}>",
      "sentence_context": "<Example sentence in {target_language}>",
      "sentence_context_translated": "<Example sentence translated into {native_language}>"
    }}
  ]
}}

Rules:
- Always write explanations (`overall_feedback`, `short_explanation`, `meaning`, `definition`, `translation`, `sentence_context_translated`) in {native_language}.
- If the user wrote parts in {native_language}, include each one in `corrections` with `"type": "mixed_translation"` and also include the translated English expression in `suggested_words` so they can save it to their vocabulary.
- Provide 3 to 5 high-value items in `suggested_words` and 2 to 3 items in `speaking_connectors`.
- Return ONLY raw JSON."""


CHAT_SYSTEM_PROMPT = """You are an engaging, friendly conversation partner and {target_language} coach for a native {native_language} speaker.
Current Scenario / Topic: {scenario}

The user may write in {target_language} or mix in {native_language} words when they get stuck.
1. Continue the conversation naturally in {target_language} (staying in character for the scenario, asking an engaging follow-up question to keep the dialogue flowing).
2. Analyze the user's latest message (if provided) and give helpful, non-intrusive coaching feedback.

Return ONLY a valid raw JSON object (no markdown fences) with this exact structure:
{{
  "reply": "<Your natural conversational response in {target_language} (2-4 sentences, engaging and natural)>",
  "reply_translation": "<{native_language} translation of your reply>",
  "user_feedback": {{
    "is_perfect": <true if the user's message was completely natural and grammatically correct without any {native_language} words, otherwise false>,
    "corrected": "<The user's message corrected in {target_language} (with any {native_language} words translated into {target_language})>",
    "natural_alternative": "<How a native speaker would casually say the user's message in real-life conversation>",
    "short_explanation": "<Brief 1-2 sentence explanation in {native_language} of the main improvement or praise>",
    "corrections": [
      {{
        "original": "<The specific part of the user's message that needed fixing or translation>",
        "corrected": "<The fixed {target_language} version>",
        "type": "<grammar | mixed_translation | natural_phrasing | vocabulary>",
        "short_explanation": "<Brief explanation in {native_language}>"
      }}
    ],
    "suggested_words": [
      {{
        "word": "<A useful word/phrase from your reply or the corrected message in {target_language}>",
        "phonetic": "<word / pronunciation>",
        "translation": "<{native_language} translation>",
        "definition": "<Brief explanation in {native_language}>",
        "sentence_context": "<Example sentence in {target_language}>",
        "sentence_context_translated": "<Example sentence translated to {native_language}>"
      }}
    ]
  }}
}}

If there is no user message yet (starting the conversation), set `user_feedback` to null and provide an inviting opening message in `reply`.
Return ONLY raw JSON."""


DEEP_DIVE_SYSTEM_PROMPT = """You are an expert, patient {target_language} grammar and linguistics tutor explaining concepts to a native {native_language} speaker.

Context under discussion:
- User's original phrase/sentence: "{original_text}"
- Suggested/corrected version: "{corrected_text}"
- Full context: "{context_sentence}"

Answer the user's question thoroughly, clearly, and warmly in {native_language}.
Explain the underlying grammatical reason ("რატომ არის ასე"), the nuance difference between the user's version and the corrected version, when (if ever) the user's version could be used, and give 2-3 clear examples with {native_language} translations.

Return ONLY a valid raw JSON object (no markdown fences) with this exact structure:
{{
  "answer": "<Clear, well-structured explanation in {native_language}. Use bullet points or short paragraphs for readability>",
  "grammar_rule_title": "<Short title of the grammar rule or nuance in {target_language} / {native_language}, e.g. 'Present Perfect vs Past Simple'>",
  "examples": [
    {{
      "correct": "<Example sentence in {target_language}>",
      "translation": "<Translation in {native_language}>",
      "wrong_variant": "<Optional common mistake version to contrast, or empty string>"
    }}
  ],
  "suggested_words": [
    {{
      "word": "<Key phrase, collocation, or word from this explanation in {target_language}>",
      "phonetic": "<pronunciation>",
      "translation": "<{native_language} translation>",
      "definition": "<Short explanation in {native_language}>",
      "sentence_context": "<Example sentence in {target_language}>",
      "sentence_context_translated": "<Example sentence translated to {native_language}>"
    }}
  ]
}}"""


async def _call_llm_json(
    messages: List[Dict[str, str]],
    provider: Optional[str] = None,
    temperature: float = 0.3,
) -> Dict[str, Any]:
    """Call the configured LLM provider and parse the JSON response."""
    effective = provider or settings.LLM_PROVIDER
    api_key, model, base_url = _resolve_provider(provider)

    if effective == "local":
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "format": "json",
        }
        async with httpx.AsyncClient(base_url=base_url, timeout=120.0) as client:
            response = await client.post("/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()
            raw = _clean_translation(data.get("message", {}).get("content", ""))
            return json.loads(raw)

    client = AsyncOpenAI(api_key=api_key, base_url=base_url, max_retries=0)
    last_exc: Optional[Exception] = None
    try:
        for candidate_model in _fallback_models_for(model, base_url):
            try:
                response = await client.chat.completions.create(
                    model=candidate_model,
                    messages=messages,
                    temperature=temperature,
                    response_format={"type": "json_object"},
                    max_tokens=4096,
                )
                raw = _clean_translation(response.choices[0].message.content or "")
                return json.loads(raw)
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "Writing LLM model %s failed (%s), trying next fallback...",
                    candidate_model,
                    exc,
                )
        raise last_exc or TranslationError("All LLM models failed")
    finally:
        await client.close()


async def evaluate_writing(
    text: str,
    *,
    topic: str = "",
    target_language: str = "en",
    native_language: str = "ka",
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """Evaluate free-form writing and return multi-level rewrites, corrections, and vocabulary."""
    tgt_name = _resolve_lang_name(target_language)
    nat_name = _resolve_lang_name(native_language)

    system_prompt = EVALUATE_SYSTEM_PROMPT.format(
        target_language=tgt_name,
        native_language=nat_name,
    )

    user_content = f"Topic/Context: {topic}\n\nUser's text:\n{text}" if topic else f"User's text:\n{text}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    try:
        data = await _call_llm_json(messages, provider=provider, temperature=0.3)
        return {
            "corrected_text": data.get("corrected_text", text),
            "natural_spoken_text": data.get("natural_spoken_text", text),
            "elevated_text": data.get("elevated_text", text),
            "cefr_level": data.get("cefr_level", "B1"),
            "overall_feedback": data.get("overall_feedback", ""),
            "speaking_connectors": data.get("speaking_connectors", []),
            "corrections": data.get("corrections", []),
            "suggested_words": data.get("suggested_words", []),
        }
    except Exception as exc:
        logger.error("evaluate_writing failed: %s", exc)
        raise TranslationError(f"Writing evaluation failed: {exc}") from exc


async def chat_turn(
    messages_history: List[Dict[str, str]],
    *,
    scenario: str = "Free conversation on any interesting topic",
    target_language: str = "en",
    native_language: str = "ka",
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """Process a turn in interactive conversation/roleplay and return reply + coaching feedback."""
    tgt_name = _resolve_lang_name(target_language)
    nat_name = _resolve_lang_name(native_language)

    system_prompt = CHAT_SYSTEM_PROMPT.format(
        target_language=tgt_name,
        native_language=nat_name,
        scenario=scenario or "Friendly casual conversation",
    )

    llm_messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    if not messages_history:
        llm_messages.append(
            {
                "role": "user",
                "content": "Start the conversation in character with an engaging opening message and question.",
            }
        )
    else:
        for msg in messages_history[-12:]:
            role = "assistant" if msg.get("role") == "assistant" else "user"
            llm_messages.append({"role": role, "content": msg.get("content", "")})

    try:
        data = await _call_llm_json(llm_messages, provider=provider, temperature=0.5)
        return {
            "reply": data.get("reply", ""),
            "reply_translation": data.get("reply_translation", ""),
            "user_feedback": data.get("user_feedback"),
        }
    except Exception as exc:
        logger.error("chat_turn failed: %s", exc)
        raise TranslationError(f"Chat turn failed: {exc}") from exc


async def explain_deep_dive(
    *,
    original_text: str,
    corrected_text: str,
    context_sentence: str = "",
    question: str = "",
    history: Optional[List[Dict[str, str]]] = None,
    target_language: str = "en",
    native_language: str = "ka",
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """Provide an in-depth grammar & nuance explanation for a specific correction or phrase."""
    tgt_name = _resolve_lang_name(target_language)
    nat_name = _resolve_lang_name(native_language)

    system_prompt = DEEP_DIVE_SYSTEM_PROMPT.format(
        target_language=tgt_name,
        native_language=nat_name,
        original_text=original_text or context_sentence,
        corrected_text=corrected_text or original_text,
        context_sentence=context_sentence or corrected_text,
    )

    llm_messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    if history:
        for item in history[-8:]:
            role = "assistant" if item.get("role") == "assistant" else "user"
            llm_messages.append({"role": role, "content": item.get("content", "")})

    effective_question = (
        question.strip()
        if question and question.strip()
        else "დეტალურად ამიხსენი გრამატიკული მიზეზი, რატომ არის ეს ფორმა სწორი, რატომ არ ვარგოდა თავდაპირველი ვარიანტი და რა ნიუანსური სხვაობაა მათ შორის."
    )
    llm_messages.append({"role": "user", "content": effective_question})

    try:
        data = await _call_llm_json(llm_messages, provider=provider, temperature=0.3)
        return {
            "answer": data.get("answer", ""),
            "grammar_rule_title": data.get("grammar_rule_title", ""),
            "examples": data.get("examples", []),
            "suggested_words": data.get("suggested_words", []),
        }
    except Exception as exc:
        logger.error("explain_deep_dive failed: %s", exc)
        raise TranslationError(f"Deep dive explanation failed: {exc}") from exc


PATTERN_ANALYSIS_SYSTEM_PROMPT = """You are an expert {target_language} diagnostic language coach analyzing a native {native_language} speaker's saved writing submissions and past mistakes.

Your goal:
1. Identify the top 2 to 4 RECURRING weak spots / error patterns across their essays (e.g., tense confusion, prepositions, articles, word order, literal translations from {native_language}, or limited connectors).
2. Explain clearly in {native_language} WHY each problem happens and give a memorable "Golden Rule / Solution" ("ოქროს წესი") to fix it.
3. For each weak spot, create 2 interactive "Micro-Fix Drills" where the user has to translate/write a sentence from {native_language} into {target_language} applying that exact rule.

Return ONLY a valid raw JSON object (no markdown fences) with this exact structure:
{{
  "overall_summary": "<2-3 encouraging, insightful sentences in {native_language} summarizing their progress, strengths, and main habit patterns across these essays>",
  "level_trend": "<e.g. 'B1' or 'B1 ➔ B2'>",
  "weak_spots": [
    {{
      "category": "<Title of the recurring issue, e.g. 'Prepositions (in / on / at)' or 'Past Simple vs Present Perfect'>",
      "frequency_label": "<Short label in {native_language}, e.g. 'მთავარი სუსტი წერტილი' or 'განმეორებადი შეცდომა'>",
      "why_it_happens": "<Clear explanation in {native_language} of why this mistake happens>",
      "golden_rule": "<Short, memorable solution/rule in {native_language} that fixes this mistake>",
      "user_examples": [
        {{
          "wrong": "<Mistake from the user's essays>",
          "right": "<Corrected {target_language} version>"
        }}
      ],
      "drills": [
        {{
          "prompt_ka": "<A sentence in {native_language} (or a broken {target_language} sentence to fix) that tests this exact rule>",
          "hint": "<Short hint in {target_language} or {native_language}>",
          "correct_answer": "<The natural, grammatically correct {target_language} sentence>",
          "explanation_ka": "<1-sentence explanation in {native_language} of why this answer is right>"
        }}
      ]
    }}
  ]
}}

Return ONLY raw JSON."""


async def analyze_writing_patterns(
    submissions_summary: List[Dict[str, Any]],
    *,
    target_language: str = "en",
    native_language: str = "ka",
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """Analyze recurring mistakes across user's saved writings and generate targeted drills."""
    tgt_name = _resolve_lang_name(target_language)
    nat_name = _resolve_lang_name(native_language)

    system_prompt = PATTERN_ANALYSIS_SYSTEM_PROMPT.format(
        target_language=tgt_name,
        native_language=nat_name,
    )

    user_payload = json.dumps(submissions_summary, ensure_ascii=False, indent=2)
    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": f"Here are the user's recent writing submissions and corrections:\n{user_payload}",
        },
    ]

    try:
        data = await _call_llm_json(messages, provider=provider, temperature=0.3)
        return {
            "overall_summary": data.get("overall_summary", ""),
            "level_trend": data.get("level_trend", "B1"),
            "weak_spots": data.get("weak_spots", []),
        }
    except Exception as exc:
        logger.error("analyze_writing_patterns failed: %s", exc)
        raise TranslationError(f"Pattern analysis failed: {exc}") from exc

