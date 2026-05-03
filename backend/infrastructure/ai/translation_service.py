"""
Translation Service — context-aware literary translation to Georgian.

Architecture:
- Default: OpenAI-compatible API (LLM_PROVIDER=openai)
- Runtime override via ``provider="gemini"|"deepseek"``
- Also supports LLM_PROVIDER=local (Ollama /api/chat)
"""
import json
import logging
from typing import Any, Dict, Optional

import httpx
from openai import AsyncOpenAI

from config.settings import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a professional literary translator. Translate the provided text from "
    "{source_language} to Georgian. Preserve the literary style, tone, and nuances "
    "of the original text. Use natural, idiomatic Georgian expressions where appropriate. "
    "The book title is '{book_title}'. Use the provided context (text before and after) "
    "to ensure translation consistency. Return ONLY the translated text, no explanations."
)

WORD_SYSTEM_PROMPT = (
    "You are a language tutor helping a student learn {source_language} through Georgian. "
    "Given a single word or short phrase, provide a structured response in the following "
    "JSON format (no markdown, no code fences, just raw JSON):\n\n"
    '{{\n'
    '  "translation": "<Georgian translation — include BOTH the dictionary/lemma meaning AND the specific contextual form as used in the sentence. If they differ, format as: `dictionary_meaning, contextual_form`. Example: if the dictionary meaning is \'tightness\' but in the sentence it is \'tightened\', write: \'დაჭიმულობა, დაეჭიმა\'. If the dictionary and contextual forms are identical, just the single word.>",\n'
    '  "phonetic": "<original word> / <standard English pronunciation> / <Georgian-script pronunciation>",\n'
    '  "definition": "<short definition or explanation in Georgian>",\n'
    '  "sentence_context": "<example sentence in original language using this word>",\n'
    '  "sentence_context_translated": "<example sentence translated to Georgian>"\n'
    '}}\n\n'
    "IMPORTANT instructions for `phonetic`:\n"
    "- Format it as: original_word / standard_pronunciation / Georgian_script_pronunciation\n"
    "- Example: \"very / ˈverē / ვერი\"\n"
    "- The first part is the original word.\n"
    "- The second part is the standard English pronunciation using simple dictionary notation or IPA.\n"
    "- The third part shows how a Georgian speaker would read/pronounce it, written in Georgian script.\n\n"
    "The book title is '{book_title}'. Use provided context for disambiguation if available. "
    "Return ONLY the raw JSON object, nothing else."
)


class TranslationError(Exception):
    """Raised when translation fails for any reason."""


def _clean_translation(text: str) -> str:
    """Strip markdown code-fences and surrounding quotes from LLM output."""
    text = text.strip()
    if text.startswith("```") and text.endswith("```"):
        text = text[3:-3].strip()
        if text.startswith(("json", "text", "html")):
            _, _, text = text.partition("\n")
    return text.strip('"').strip("'").strip()


def _resolve_provider(provider: Optional[str] = None):
    """Return (api_key, model, base_url) for the given or default provider."""
    effective = provider or settings.LLM_PROVIDER

    if effective == "gemini":
        return settings.GEMINI_API_KEY, settings.GEMINI_MODEL, settings.GEMINI_BASE_URL
    if effective == "deepseek":
        return settings.DEEPSEEK_API_KEY, settings.DEEPSEEK_MODEL, settings.DEEPSEEK_BASE_URL
    if effective == "local":
        return "", settings.LOCAL_MODEL, settings.LOCAL_BASE_URL
    return settings.LLM_API_KEY, settings.LLM_MODEL, settings.LLM_BASE_URL


async def _call_openai(
    passage: str,
    left_context: str,
    right_context: str,
    book_title: str,
    source_language: str,
    api_key: str,
    model: str,
    base_url: str,
) -> str:
    """Translate via OpenAI-compatible chat API."""
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT.format(
                source_language=source_language, book_title=book_title
            ),
        },
    ]

    if left_context:
        messages.append({"role": "user", "content": f"Context before:\n{left_context}"})
        messages.append({"role": "assistant", "content": "Understood, I'll use this as context."})

    if right_context:
        messages.append({"role": "user", "content": f"Context after:\n{right_context}"})
        messages.append({"role": "assistant", "content": "Understood, I'll use this as context."})

    messages.append({"role": "user", "content": f"Translate:\n{passage}"})

    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.3,
        max_tokens=4096,
    )
    await client.close()
    return _clean_translation(response.choices[0].message.content or "")


async def _call_local(
    passage: str,
    left_context: str,
    right_context: str,
    book_title: str,
    source_language: str,
    model: str,
    base_url: str,
) -> str:
    """Translate via Ollama local API (/api/chat)."""
    system_content = SYSTEM_PROMPT.format(
        source_language=source_language, book_title=book_title
    )

    messages = [{"role": "system", "content": system_content}]

    if left_context:
        messages.append({"role": "user", "content": f"Context before:\n{left_context}"})
        messages.append({"role": "assistant", "content": "Understood."})

    if right_context:
        messages.append({"role": "user", "content": f"Context after:\n{right_context}"})
        messages.append({"role": "assistant", "content": "Understood."})

    messages.append({"role": "user", "content": f"Translate:\n{passage}"})

    payload = {"model": model, "messages": messages, "stream": False}

    async with httpx.AsyncClient(base_url=base_url, timeout=120.0) as client:
        response = await client.post("/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
        content = data.get("message", {}).get("content", "")
        return _clean_translation(content)


async def translate(
    passage: str,
    *,
    left_context: str = "",
    right_context: str = "",
    book_title: str = "",
    source_language: str = "en",
    provider: Optional[str] = None,
) -> str:
    """Translate a passage of text to Georgian.

    Args:
        passage: The text to translate.
        left_context: Surrounding text before the passage.
        right_context: Surrounding text after the passage.
        book_title: Title of the book for LLM context.
        source_language: Language code of the source text.
        provider: Override provider (``"gemini"``, ``"deepseek"``, ``"local"``, or ``None`` for default).

    Returns:
        The translated text.
    """
    api_key, model, base_url = _resolve_provider(provider)
    effective = provider or settings.LLM_PROVIDER

    try:
        if effective == "local":
            return await _call_local(
                passage, left_context, right_context,
                book_title, source_language, model, base_url,
            )
        return await _call_openai(
            passage, left_context, right_context,
            book_title, source_language, api_key, model, base_url,
        )
    except Exception as exc:
        logger.error("Translation failed (provider=%s): %s", effective, exc)
        raise TranslationError(str(exc)) from exc


async def translate_word(
    word: str,
    *,
    left_context: str = "",
    right_context: str = "",
    book_title: str = "",
    source_language: str = "en",
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """Translate a single word to Georgian with phonetic, definition, and sentence context.

    Args:
        word: The word to translate.
        left_context: Surrounding text before the word.
        right_context: Surrounding text after the word.
        book_title: Title of the book for LLM context.
        source_language: Language code of the source text.
        provider: Override provider.

    Returns:
        Dict with keys: translation, phonetic, definition, sentence_context, sentence_context_translated.
    """
    api_key, model, base_url = _resolve_provider(provider)
    effective = provider or settings.LLM_PROVIDER

    try:
        if effective == "local":
            raw = await _call_local_word(
                word, left_context, right_context,
                book_title, source_language, model, base_url,
            )
        else:
            raw = await _call_openai_word(
                word, left_context, right_context,
                book_title, source_language, api_key, model, base_url,
            )
        return json.loads(raw)
    except (json.JSONDecodeError, Exception) as exc:
        logger.error("Word translation failed (provider=%s): %s", effective, exc)
        raise TranslationError(str(exc)) from exc


async def _call_openai_word(
    word: str,
    left_context: str,
    right_context: str,
    book_title: str,
    source_language: str,
    api_key: str,
    model: str,
    base_url: str,
) -> str:
    """Translate a word via OpenAI-compatible chat API using WORD_SYSTEM_PROMPT."""
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    messages = [
        {
            "role": "system",
            "content": WORD_SYSTEM_PROMPT.format(
                source_language=source_language, book_title=book_title
            ),
        },
    ]

    context_parts = []
    if left_context:
        context_parts.append(f"Context before:\n{left_context}")
    if right_context:
        context_parts.append(f"Context after:\n{right_context}")
    if context_parts:
        messages.append({"role": "user", "content": "\n\n".join(context_parts)})
        messages.append({"role": "assistant", "content": "Understood, I'll use this context."})

    messages.append({"role": "user", "content": f"Translate this word:\n{word}"})

    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.3,
        max_tokens=1024,
    )
    await client.close()
    return _clean_translation(response.choices[0].message.content or "")


async def _call_local_word(
    word: str,
    left_context: str,
    right_context: str,
    book_title: str,
    source_language: str,
    model: str,
    base_url: str,
) -> str:
    """Translate a word via Ollama local API with WORD_SYSTEM_PROMPT."""
    system_content = WORD_SYSTEM_PROMPT.format(
        source_language=source_language, book_title=book_title
    )

    messages = [{"role": "system", "content": system_content}]

    context_parts = []
    if left_context:
        context_parts.append(f"Context before:\n{left_context}")
    if right_context:
        context_parts.append(f"Context after:\n{right_context}")
    if context_parts:
        messages.append({"role": "user", "content": "\n\n".join(context_parts)})
        messages.append({"role": "assistant", "content": "Understood."})

    messages.append({"role": "user", "content": f"Translate this word:\n{word}"})

    payload = {"model": model, "messages": messages, "stream": False}

    async with httpx.AsyncClient(base_url=base_url, timeout=120.0) as client:
        response = await client.post("/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
        content = data.get("message", {}).get("content", "")
        return _clean_translation(content)