"""
Translation Service — context-aware literary translation to Georgian.

Architecture:
- Default provider: OpenAI-compatible API (LLM_PROVIDER=openai)
- Runtime override: provider="gemini" | "deepseek"
- Also supports LLM_PROVIDER=local (Ollama native /api/chat endpoint)
- Clean public API via translate() with left/right context
"""
import json
import logging
from typing import Optional

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


class TranslationError(Exception):
    """Raised when translation fails for any reason."""


def _clean_translation(text: str) -> str:
    """Strip markdown code fences and surrounding quotes from LLM output."""
    text = text.strip()
    if text.startswith("```") and text.endswith("```"):
        text = text[3:-3].strip()
        if text.startswith(("json", "text", "html")):
            _, _, text = text.partition("\n")
    return text.strip('"').strip("'").strip()


class TranslationService:
    """Handles translation of text passages via configurable LLM providers."""

    def __init__(self):
        self._client: Optional[AsyncOpenAI] = None
        self._http_client: Optional[httpx.AsyncClient] = None
        self._local_client: Optional[httpx.AsyncClient] = None

    def _resolve_provider(self, provider: Optional[str] = None):
        """Resolve API credentials and model for the given provider.

        Returns (api_key, model, base_url, effective_provider_name).
        """
        effective = provider or settings.LLM_PROVIDER

        if effective == "gemini":
            return (
                settings.GEMINI_API_KEY,
                settings.GEMINI_MODEL,
                settings.GEMINI_BASE_URL,
                effective,
            )
        if effective == "deepseek":
            return (
                settings.DEEPSEEK_API_KEY,
                settings.DEEPSEEK_MODEL,
                settings.DEEPSEEK_BASE_URL,
                effective,
            )
        if effective == "local":
            return ("", settings.LOCAL_MODEL, settings.LOCAL_BASE_URL, effective)

        # Default: OpenAI-compatible
        return (
            settings.LLM_API_KEY,
            settings.LLM_MODEL,
            settings.LLM_BASE_URL,
            effective,
        )

    async def _call_openai(
        self,
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
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

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

        response = await self._client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,
            max_tokens=4096,
        )

        content = response.choices[0].message.content or ""
        return _clean_translation(content)

    async def _call_local(
        self,
        passage: str,
        left_context: str,
        right_context: str,
        book_title: str,
        source_language: str,
        model: str,
        base_url: str,
    ) -> str:
        """Translate via Ollama local API (/api/chat endpoint)."""
        self._local_client = httpx.AsyncClient(base_url=base_url, timeout=120.0)

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

        response = await self._local_client.post("/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
        content = data.get("message", {}).get("content", "")
        return _clean_translation(content)

    async def translate(
        self,
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
            provider: Override provider ("gemini", "deepseek", "local", or None for default).

        Returns:
            The translated text.
        """
        api_key, model, base_url, effective = self._resolve_provider(provider)

        try:
            if effective == "local":
                return await self._call_local(
                    passage, left_context, right_context,
                    book_title, source_language, model, base_url,
                )
            return await self._call_openai(
                passage, left_context, right_context,
                book_title, source_language, api_key, model, base_url,
            )
        except Exception as exc:
            logger.error("Translation failed (provider=%s): %s", effective, exc)
            raise TranslationError(str(exc)) from exc

    async def close(self) -> None:
        """Clean up HTTP clients on app shutdown."""
        if self._client:
            await self._client.close()
        if self._http_client:
            await self._http_client.aclose()
        if self._local_client:
            await self._local_client.aclose()