"""
Context-aware translation service.

Uses an LLM to translate selected passages from a book into Georgian,
with awareness of surrounding context (previous/next paragraphs) for
better idiomatic translation.

Supports multiple providers at runtime:
  1. OpenAI API (via openai Python package)
  2. Local LLM via HTTP (e.g. Ollama, LM Studio, LocalAI, etc.)
  
At runtime, the caller can specify a provider override: "gemini", "deepseek",
or None (uses the default LLM_PROVIDER from settings).
"""

import json
import logging
from typing import Optional
from httpx import AsyncClient, HTTPError
from config.settings import settings

logger = logging.getLogger(__name__)


class TranslationService:
    """Translates passages into Georgian with context awareness."""

    # Supported runtime provider aliases and their settings key prefixes
    PROVIDER_ALIASES = {
        "gemini":   {"api_key": "GEMINI_API_KEY",   "model": "GEMINI_MODEL",   "base_url": "GEMINI_BASE_URL"},
        "deepseek": {"api_key": "DEEPSEEK_API_KEY", "model": "DEEPSEEK_MODEL", "base_url": "DEEPSEEK_BASE_URL"},
    }

    def __init__(self):
        self._client: Optional[AsyncClient] = None

    async def _get_client(self, base_url: str) -> AsyncClient:
        if self._client is not None:
            return self._client
        self._client = AsyncClient(
            base_url=base_url,
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
        provider: Optional[str] = None,  # "gemini", "deepseek", or None for default
    ) -> str:
        """
        Translate a passage into Georgian with context awareness.

        Args:
            passage: The selected text to translate.
            left_context: Text before the passage (previous paragraphs).
            right_context: Text after the passage (next paragraphs).
            book_title: Title of the book (for LLM context).
            source_language: Source language code (e.g. 'en', 'de', 'fr').
            provider: Override provider alias ("gemini", "deepseek") or None for default.

        Returns:
            Georgian translation of the passage.
        """
        # Resolve effective provider config
        if provider and provider.lower() in self.PROVIDER_ALIASES:
            alias = self.PROVIDER_ALIASES[provider.lower()]
            api_key = getattr(settings, alias["api_key"], "") or settings.LLM_API_KEY
            model = getattr(settings, alias["model"], "") or settings.LLM_MODEL
            base_url = getattr(settings, alias["base_url"], "") or settings.LLM_BASE_URL
            effective_provider = "openai"  # All provider aliases use OpenAI-compatible API
        else:
            api_key = settings.LLM_API_KEY
            model = settings.LLM_MODEL
            base_url = settings.LLM_BASE_URL
            effective_provider = settings.LLM_PROVIDER

        logger.info(
            "translate_service ENTER effective_provider=%s model=%s base_url=%s "
            "requested_provider=%s book_title=%s source_language=%s "
            "passage_len=%d left_ctx_len=%d right_ctx_len=%d",
            effective_provider, model, base_url,
            provider, book_title, source_language,
            len(passage), len(left_context), len(right_context),
        )
        logger.debug("translate_service passage[:200]=%s", passage[:200])
        if left_context:
            logger.debug("translate_service left_context[:200]=%s", left_context[:200])
        if right_context:
            logger.debug("translate_service right_context[:200]=%s", right_context[:200])

        if effective_provider == "openai":
            result = await self._translate_openai(
                passage, left_context, right_context,
                book_title, source_language,
                api_key=api_key, model=model, base_url=base_url,
            )
        elif effective_provider == "local":
            result = await self._translate_local(
                passage, left_context, right_context,
                book_title, source_language,
                model=model, base_url=base_url,
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {effective_provider}")

        logger.info("translate_service SUCCESS result_len=%d", len(result))
        logger.debug("translate_service result[:200]=%s", result[:200])
        return result

    # ── OpenAI API ──

    async def _translate_openai(
        self,
        passage: str,
        left_context: str,
        right_context: str,
        book_title: str,
        source_language: str,
        *,
        api_key: str,
        model: str,
        base_url: str,
    ) -> str:
        try:
            import openai

            client = openai.AsyncOpenAI(
                api_key=api_key,
                base_url=base_url if base_url else None,
            )

            system_prompt = self._build_system_prompt(book_title, source_language)
            user_prompt = self._build_user_prompt(passage, left_context, right_context)

            response = await client.chat.completions.create(
                model=model,
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
            logger.error(f"OpenAI-compatible translation failed (model={model}): {e}")
            raise

    # ── Local LLM (Ollama native API) ──
    #
    # Uses Ollama's native /api/chat endpoint.
    # For other OpenAI-compatible local servers (LM Studio, LocalAI),
    # set LLM_PROVIDER=openai and LLM_BASE_URL to that server's URL.

    async def _translate_local(
        self,
        passage: str,
        left_context: str,
        right_context: str,
        book_title: str,
        source_language: str,
        *,
        model: str,
        base_url: str,
    ) -> str:
        client = await self._get_client(base_url)

        system_prompt = self._build_system_prompt(book_title, source_language)
        user_prompt = self._build_user_prompt(passage, left_context, right_context)

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "options": {
                "temperature": 0.3,
                "num_predict": 2000,
            },
            "stream": False,
        }

        try:
            # Ollama native API endpoint: POST /api/chat
            resp = await client.post("/api/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()
            raw = data["message"]["content"]
            return self._clean_translation(raw)

        except HTTPError as e:
            logger.error(f"Local LLM (Ollama) HTTP error: {e}")
            raise
        except (KeyError, IndexError, json.JSONDecodeError) as e:
            logger.error(f"Local LLM (Ollama) response parse error: {e}")
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

        if left_context and len(left_context) <= settings.LLM_MAX_CONTEXT_CHARS:
            parts.append(f"[PRECEDING CONTEXT]\n{left_context}\n")

        parts.append(f"[PASSAGE TO TRANSLATE]\n{passage}\n")

        if right_context and len(right_context) <= settings.LLM_MAX_CONTEXT_CHARS:
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