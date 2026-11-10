"""Routes for AI Configuration, Model Selection, and Connection Verification."""
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
import httpx
from openai import AsyncOpenAI

from config.settings import settings
from domain.entities.user import User
from infrastructure.web.api.v1.dependencies import get_current_user
from infrastructure.ai.translation_service import _resolve_provider

logger = logging.getLogger(__name__)
router = APIRouter()


class TestConnectionRequest(BaseModel):
    provider: str = "gemini"
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class TestConnectionResponse(BaseModel):
    success: bool
    message: str
    resolved_provider: str
    resolved_model: str
    used_custom_key: bool


PROVIDER_MODELS: Dict[str, List[Dict[str, str]]] = {
    "gemini": [
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "desc": "ყველაზე სწრაფი & ეკონომიური (რეკომენდებული)"},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "desc": "ღრმა აზროვნება და მაღალი ლიტერატურული ხარისხი"},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "desc": "სტაბილური და სწრაფი ალტერნატივა"},
    ],
    "deepseek": [
        {"id": "deepseek-chat", "name": "DeepSeek V3 (Chat)", "desc": "შესანიშნავი ლიტერატურული ენა და სიზუსტე"},
        {"id": "deepseek-reasoner", "name": "DeepSeek R1 (Reasoner)", "desc": "ღრმა გრამატიკული და ლოგიკური ანალიზი"},
    ],
    "openai": [
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "desc": "სწრაფი, მსუბუქი და იაფი"},
        {"id": "gpt-4o", "name": "GPT-4o", "desc": "ფლაგმანი მოდელი მაღალი სიზუსტით"},
    ],
    "local": [
        {"id": "mistral", "name": "Mistral (Local Ollama)", "desc": "ლოკალური ოფლაინ მოდელი"},
        {"id": "llama3", "name": "Llama 3 (Local Ollama)", "desc": "ძლიერი ლოკალური მოდელი"},
    ],
}


@router.get("/models")
async def get_available_models(current_user: User = Depends(get_current_user)):
    """Return available providers and recommended models."""
    return {
        "providers": PROVIDER_MODELS,
        "server_default_provider": settings.LLM_PROVIDER,
        "has_server_gemini_key": bool(settings.GEMINI_API_KEY or settings.LLM_API_KEY),
        "has_server_deepseek_key": bool(settings.DEEPSEEK_API_KEY),
    }


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_ai_connection(
    payload: TestConnectionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Test whether the provided AI configuration or custom API key works.
    Performs a lightweight 1-token test prompt.
    """
    prov = (payload.provider or "gemini").lower().strip()
    api_key, model, base_url = _resolve_provider(
        provider=prov,
        api_key_override=payload.api_key.strip() if payload.api_key else None,
        model_override=payload.model.strip() if payload.model else None,
        base_url_override=payload.base_url.strip() if payload.base_url else None,
    )

    used_custom = bool(payload.api_key and payload.api_key.strip())

    try:
        if prov == "local":
            async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
                resp = await client.get("/api/tags")
                if resp.status_code == 200:
                    return TestConnectionResponse(
                        success=True,
                        message="ლოკალურ Ollama სერვერთან კავშირი წარმატებულია!",
                        resolved_provider=prov,
                        resolved_model=model,
                        used_custom_key=False,
                    )
                else:
                    return TestConnectionResponse(
                        success=False,
                        message=f"ლოკალურმა სერვერმა დააბრუნა სტატუსი: {resp.status_code}",
                        resolved_provider=prov,
                        resolved_model=model,
                        used_custom_key=False,
                    )
        else:
            if not api_key:
                return TestConnectionResponse(
                    success=False,
                    message="API გასაღები ვერ მოიძებნა. გთხოვთ შეიყვანოთ თქვენი პირადი გასაღები.",
                    resolved_provider=prov,
                    resolved_model=model,
                    used_custom_key=used_custom,
                )

            client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=10.0, max_retries=0)
            try:
                res = await client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": "Respond strictly with the single word: OK"}],
                    max_tokens=5,
                )
                reply = (res.choices[0].message.content or "").strip()
                return TestConnectionResponse(
                    success=True,
                    message=f"კავშირი წარმატებით დამყარდა! ({prov} -> {model})",
                    resolved_provider=prov,
                    resolved_model=model,
                    used_custom_key=used_custom,
                )
            finally:
                await client.close()

    except Exception as exc:
        err_msg = str(exc)
        logger.warning("AI connection test failed for provider=%s model=%s: %s", prov, model, err_msg)
        if "401" in err_msg or "Invalid API Key" in err_msg or "API_KEY_INVALID" in err_msg:
            err_msg = "შეცდომა 401: შეყვანილი API Key არასწორია ან ვადაგასულია."
        elif "429" in err_msg or "QuotaExceeded" in err_msg:
            err_msg = "შეცდომა 429: ლიმიტი ამოიწურა (Rate Limit / Quota Exceeded)."
        elif "404" in err_msg or "model_not_found" in err_msg:
            err_msg = f"შეცდომა 404: მოდელი '{model}' ვერ მოიძებნა ამ პროვაიდერთან."

        return TestConnectionResponse(
            success=False,
            message=err_msg,
            resolved_provider=prov,
            resolved_model=model,
            used_custom_key=used_custom,
        )
