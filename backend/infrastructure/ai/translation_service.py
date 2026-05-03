"""
Context-aware translation service.

Translates selected passages into Georgian with awareness of surrounding
context (previous/next paragraphs) for better idiomatic translation.

Supports:
  1. OpenAI-compatible API (default, also used for gemini/deepseek aliases)
  2. Local LLM via HTTP (Ollama native /api/chat endpoint)
"""
import logging
from typing import Optional

import openai
from httpx import AsyncClient

from config.settings import settings

logger = logging.getLogger(__name__)

# ── Provider configuration ──

ProviderConfig = dict[str, str]  # {"api_key": ..., "model": ..., "base_url": ...}

PROVIDER_ALIASES: dict[str, ProviderConfig] = {
    "gemini": {
        "api_key": "GEMINI_API_KEY",
        "model": "GEMINI_MODEL",
        "base_url": "GEMINI_BASE_URL",
    },
    "deepseek": {
        "api_key": "DEEPSEEK_API_KEY",
        "model": "DEEPSEEK_MODEL",
        "base_url": "DEEPSEEK_BASE_URL",
    },
}

# Language code → human-readable name for prompts
LANG_NAMES = {
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
}


class TranslationError(Exception):
    """Raised when translation fails for any reason."""


class TranslationService:
    """Translates passages into Georgian with context awareness."""

    def __init__(self):
        self._client: Optional[AsyncClient] = None

    async def _get_client(self, base_url: str) -> AsyncClient:
        if self._client is None:
            self._client = AsyncClient(base_url=base_url, timeout=60.0)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    # ── Public API ──

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
        """Translate *passage* into Georgian.

        Args:
            passage: The selected text to translate.
            left_context: Text before the passage.
            right_context: Text after the passage.
            book_title: Book title (for LLM context).
            source_language: Source language code.
            provider: Override provider alias ("gemini", "deepseek") or *None* for default.

        Returns:
            Georgian translation of the passage.
        """
        api_key, model, base_url, effective = self._resolve_provider(provider)

        logger.info(
            "translate effective_provider=%s model=%s passage_len=%d "
            "left_ctx=%d right_ctx=%d book=%s lang=%s",
            effective, model, len(passage), len(left_context), len(right_context),
            book_title, source_language,
        )

        system = self._build_system_prompt(book_title, source_language)
        user = self._build_user_prompt(passage, left_context, right_context)

        try:
            if effective == "openai":
                result = await self._call_openai(system, user, api_key, model, base_url)
            elif effective == "local":
                result = await self._call_local(system, user, model, base_url)
            else:
                raise TranslationError(f"Unsupported provider: {effective}")
        except Exception as exc:
            logger.error("Translation failed (provider=%s model=%s): %s", effective, model, exc)
            raise TranslationError(str(exc)) from exc

        logger.info("translate SUCCESS (%d chars)", len(result))
        return result

    # ── Provider resolution ──

    @staticmethod
    def _resolve_provider(provider: Optional[str]) -> tuple[str, str, str, str]:
        """Resolve (api_key, model, base_url, effective_provider)."""
        if provider and provider.lower() in PROVIDER_ALIASES:
            alias = PROVIDER_ALIASES[provider.lower()]
            return (
                getattr(settings, alias["api_key"], "") or settings.LLM_API_KEY,
                getattr(settings, alias["model"], "") or settings.LLM_MODEL,
                getattr(settings, alias["base_url"], "") or settings.LLM_BASE_URL,
                "openai",
            )
        return (
            settings.LLM_API_KEY,
            settings.LLM_MODEL,
            settings.LLM_BASE_URL,
            settings.LLM_PROVIDER,
        )

    # ── OpenAI-compatible backend ──

    @staticmethod
    async def _call_openai(
        system: str, user: str,
        api_key: str, model: str, base_url: str,
    ) -> str:
        client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url or None)
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
            max_tokens=2000,
        )
        raw = response.choices[0].message.content.strip()
        return _clean_translation(raw)

    # ── Local LLM (Ollama native API) backend ──

    async def _call_local(
        self, system: str, user: str,
        model: str, base_url: str,
    ) -> str:
        client = await self._get_client(base_url)
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "options": {"temperature": 0.3, "num_predict": 2000},
            "stream": False,
        }
        resp = await client.post("/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()
        raw = data["message"]["content"]
        return _clean_translation(raw)

    # ── Prompt builders ──

    @staticmethod
    def _build_system_prompt(book_title: str, source_language: str) -> str:
        lang_name = LANG_NAMES.get(source_language, "English")
        lines = [
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
            lines.insert(1, f'The source text is from the book: "{book_title}".')
        return "\n".join(lines)

    @staticmethod
    def _build_user_prompt(passage: str, left_context: str, right_context: str) -> str:
        parts = []
        max_chars = settings.LLM_MAX_CONTEXT_CHARS

        if left_context and len(left_context) <= max_chars:
            parts.append(f"[PRECEDING CONTEXT]\n{left_context}\n")
        parts.append(f"[PASSAGE TO TRANSLATE]\n{passage}\n")
        if right_context and len(right_context) <= max_chars:
            parts.append(f"[FOLLOWING CONTEXT]\n{right_context}\n")
        parts.append("Translate the [PASSAGE TO TRANSLATE] into Georgian. Output ONLY the translation.")
        return "\n".join(parts)


# ── Module-level helpers ──


def _clean_translation(raw: str) -> str:
    """Remove any unwanted preamble/postamble from the LLM response."""
    raw = raw.strip().strip('"').strip("'").strip()
    if raw.startswith("```") and raw.endswith("```"):
        raw = raw[3:-3].strip()
    return raw