"""
Context-aware translation service.

Uses an LLM to translate selected passages from a book into Georgian,
with awareness of surrounding context (previous/next paragraphs) for
better idiomatic translation.

Supports two modes:
  1. OpenAI API (via openai Python package)
  2. Local LLM via HTTP (e.g. Ollama, LM Studio, LocalAI, etc.)
"""

import json
import logging
from typing import Optional
from httpx import AsyncClient, HTTPError
from config.settings import settings

logger = logging.getLogger(__name__)


class TranslationService:
    """Translates passages into Georgian with context awareness."""

    def __init__(self):
        self._client: Optional[AsyncClient] = None
        self._provider = settings.LLM_PROVIDER
        self._api_key = settings.LLM_API_KEY
        self._model = settings.LLM_MODEL
        self._base_url = settings.LLM_BASE_URL
        self._max_context_chars = settings.LLM_MAX_CONTEXT_CHARS

    async def _get_client(self) -> AsyncClient:
        if self._client is None:
            self._client = AsyncClient(
                base_url=self._base_url,
                timeout=60.0,
            )
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def translate(
        self,
        passage: str,
        *,
        left_context: str = "",
        right_context: str = "",
        book_title: str = "",
        source_language: str = "en",
    ) -> str:
        """
        Translate a passage into Georgian with context awareness.

        Args:
            passage: The selected text to translate.
            left_context: Text before the passage (previous paragraphs).
            right_context: Text after the passage (next paragraphs).
            book_title: Title of the book (for LLM context).
            source_language: Source language code (e.g. 'en', 'de', 'fr').

        Returns:
            Georgian translation of the passage.
        """
        if self._provider == "openai":
            return await self._translate_openai(
                passage, left_context, right_context,
                book_title, source_language,
            )
        elif self._provider == "local":
            return await self._translate_local(
                passage, left_context, right_context,
                book_title, source_language,
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {self._provider}")

    # ── OpenAI API ──

    async def _translate_openai(
        self,
        passage: str,
        left_context: str,
        right_context: str,
        book_title: str,
        source_language: str,
    ) -> str:
        try:
            import openai

            client = openai.AsyncOpenAI(api_key=self._api_key)

            system_prompt = self._build_system_prompt(book_title, source_language)
            user_prompt = self._build_user_prompt(passage, left_context, right_context)

            response = await client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=2000,
            )

            translation = response.choices[0].message.content.strip()
            return self._clean_translation(translation)

        except Exception as e:
            logger.error(f"OpenAI translation failed: {e}")
            raise

    # ── Local LLM (Ollama / LM Studio / LocalAI) ──

    async def _translate_local(
        self,
        passage: str,
        left_context: str,
        right_context: str,
        book_title: str,
        source_language: str,
    ) -> str:
        client = await self._get_client()

        system_prompt = self._build_system_prompt(book_title, source_language)
        user_prompt = self._build_user_prompt(passage, left_context, right_context)

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 2000,
            "stream": False,
        }

        try:
            resp = await client.post("/v1/chat/completions", json=payload)
            resp.raise_for_status()
            data = resp.json()
            raw = data["choices"][0]["message"]["content"]
            return self._clean_translation(raw)

        except HTTPError as e:
            logger.error(f"Local LLM HTTP error: {e}")
            raise
        except (KeyError, IndexError, json.JSONDecodeError) as e:
            logger.error(f"Local LLM response parse error: {e}")
            raise

    # ── Prompt builders ──

    def _build_system_prompt(self, book_title: str, source_language: str) -> str:
        lang_name = {
            "en": "English",
            "de": "German",
            "fr": "French",
            "es": "Spanish",
            "it": "Italian",
            "pt": "Portuguese",
            "ru": "Russian",
            "nl": "Dutch",
            "zh": "Chinese",
            "ja": "Japanese",
        }.get(source_language, "English")

        parts = [
            "You are a professional literary translator. Your ONLY task is to translate text from",
            f"{lang_name} into Georgian (ქართული).",
            "",
            "RULES:",
            "1. Output ONLY the Georgian translation — no explanations, no notes, no commentary.",
            "2. Use natural, idiomatic Georgian. The translation should sound like it was originally written in Georgian.",
            "3. Use the surrounding context (the paragraphs before and after) to disambiguate meaning.",
            "4. Preserve the tone, register, and style of the original passage.",
            "5. If the passage contains dialogue, keep it natural in Georgian.",
            "6. If the passage contains cultural references, adapt them appropriately for a Georgian reader where possible.",
            "7. Keep paragraph breaks if the passage spans multiple paragraphs.",
        ]

        if book_title:
            parts.insert(1, f"The source text is from the book: \"{book_title}\".")

        return "\n".join(parts)

    def _build_user_prompt(
        self,
        passage: str,
        left_context: str,
        right_context: str,
    ) -> str:
        parts = []

        if left_context and len(left_context) <= self._max_context_chars:
            parts.append(f"[PRECEDING CONTEXT]\n{left_context}\n")

        parts.append(f"[PASSAGE TO TRANSLATE]\n{passage}\n")

        if right_context and len(right_context) <= self._max_context_chars:
            parts.append(f"[FOLLOWING CONTEXT]\n{right_context}\n")

        parts.append("Translate the [PASSAGE TO TRANSLATE] into Georgian. Output ONLY the translation.")

        return "\n".join(parts)

    # ── Helpers ──

    @staticmethod
    def _clean_translation(raw: str) -> str:
        """Remove any unwanted preamble/postamble from the LLM response."""
        # Remove leading/trailing quotes the model might add
        raw = raw.strip().strip('"').strip("'").strip()
        # If the model wrapped in markdown code block
        if raw.startswith("```") and raw.endswith("```"):
            raw = raw[3:-3].strip()
        return raw