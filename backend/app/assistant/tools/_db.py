"""Shared helper: every tool opens its own short-lived DB session (tools run
outside FastAPI's per-request Depends(get_db)) and scopes every query to the
calling HR by hr_id -- the same ownership rule app/deps.py enforces on the
REST endpoints, applied here by hand since tools have no request object."""

from contextlib import asynccontextmanager

from app.database import AsyncSessionLocal


@asynccontextmanager
async def session():
    async with AsyncSessionLocal() as db:
        yield db
