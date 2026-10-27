"""
Small in-memory sliding-window rate limiter used as FastAPI dependencies.

It protects login/registration from brute force and the paid endpoints (LLM, speech) from abuse. State lives in
the process: with several workers/instances each keeps its own counters, so for a scaled deployment also limit at
the reverse proxy or swap this for a shared store (e.g. Redis). Disable in tests with RATE_LIMIT_ENABLED=false.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request

from app.core.config import settings
from app.core.deps import get_current_user
from app.models.models import User

_lock = threading.Lock()
_hits: dict[str, deque] = defaultdict(deque)
_last_sweep = 0.0


def reset() -> None:
    with _lock:
        _hits.clear()


def client_ip(request: Request) -> str:
    if settings.trust_proxy:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check(key: str, limit: int, window: int) -> None:
    global _last_sweep
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            retry = max(1, int(window - (now - q[0])))
            raise HTTPException(status_code=429, detail="Too many requests. Please wait a bit and try again.", headers={"Retry-After": str(retry)})
        q.append(now)
        if now - _last_sweep > 300:  # drop idle keys so memory stays bounded
            _last_sweep = now
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
                _hits.pop(k, None)


def by_ip(name: str, limit: int, window: int):
    def dep(request: Request):
        if settings.rate_limit_enabled:
            _check(f"{name}:ip:{client_ip(request)}", limit, window)
    return dep


def by_user(name: str, limit: int, window: int):
    def dep(user: User = Depends(get_current_user)):
        if settings.rate_limit_enabled:
            _check(f"{name}:user:{user.id}", limit, window)
    return dep
