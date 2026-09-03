import os
import secrets

from fastapi import Header, HTTPException


async def require_internal_service(
    x_internal_token: str | None = Header(default=None),
) -> None:
    """
    Gate governance-only mutations behind a shared-secret internal service token.

    Fails closed. When INTERNAL_SERVICE_TOKEN is unset server-side the endpoint
    is unusable rather than open, so a forgotten env var cannot silently restore
    the unauthenticated behaviour this replaces.

    Lives here rather than in main.py because main.py imports app.anfis_router,
    so a dependency defined there could not be imported back without a cycle.
    """
    expected = os.getenv("INTERNAL_SERVICE_TOKEN")
    if not expected or x_internal_token is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
