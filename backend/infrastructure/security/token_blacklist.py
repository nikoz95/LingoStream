from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as aioredis

from config.settings import settings


class TokenBlacklistService:
    """Redis-backed service for blacklisting JWT tokens after logout."""

    def __init__(self, redis_client: Optional[aioredis.Redis] = None):
        self._redis = redis_client or aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )

    async def blacklist_token(self, jti: str, expires_at: int) -> None:
        """
        Add a token's JWT ID to the blacklist.

        Args:
            jti: The unique JWT ID (token identifier).
            expires_at: Unix timestamp when the token expires.
                        The Redis key will have a TTL matching the remaining
                        lifetime of the token.
        """
        now_ts = int(datetime.now(timezone.utc).timestamp())
        ttl = max(expires_at - now_ts, 1)  # at least 1 second
        await self._redis.setex(f"token_blacklist:{jti}", ttl, "1")

    async def is_blacklisted(self, jti: str) -> bool:
        """Check whether a JWT ID is blacklisted."""
        result = await self._redis.get(f"token_blacklist:{jti}")
        return result is not None

    async def close(self) -> None:
        """Close the underlying Redis connection."""
        await self._redis.close()