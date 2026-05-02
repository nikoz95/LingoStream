"""
Quick integration test for the translation service.

Usage: docker compose exec backend python tests/test_translate.py
"""
import asyncio
import sys
import os

# Add backend root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Override settings with env vars so we use the correct model
os.environ["LLM_MODEL"] = "qwen2.5-coder:14b"
os.environ["LLM_BASE_URL"] = "http://host.docker.internal:11434"
os.environ["LLM_PROVIDER"] = "local"

from infrastructure.ai.translation_service import TranslationService


async def main():
    svc = TranslationService()
    result = await svc.translate(
        passage="The sun was setting behind the mountains, casting long shadows across the valley.",
        left_context="He walked to the window and looked out at the evening sky.",
        right_context="The birds were singing their last songs of the day.",
        book_title="The Last Journey",
        source_language="en",
    )
    print(f"Translation result:\n{result}")
    print(f"\nLength: {len(result)} chars")
    await svc.close()


if __name__ == "__main__":
    asyncio.run(main())