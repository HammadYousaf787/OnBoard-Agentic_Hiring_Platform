"""Tiny in-process sliding-window rate limiter, used only on the public
(unauthenticated) application endpoint. State is per server process, so it
resets on restart and isn't shared across multiple workers -- fine for a
single-instance deployment; swap for Redis/slowapi before scaling out."""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, status


class SlidingWindowLimiter:
    def __init__(self, max_events: int, window_seconds: int) -> None:
        self._max = max_events
        self._window = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        events = self._events[key]
        while events and now - events[0] > self._window:
            events.popleft()
        if len(events) >= self._max:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many applications from this connection. Please try again later.",
            )
        events.append(now)
