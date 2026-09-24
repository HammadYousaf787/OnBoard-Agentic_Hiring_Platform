"""Persists graph state (conversation history + any paused interrupt) in
the same Postgres database as everything else, keyed by thread_id. This is
what lets a paused booking confirmation (see tools/scheduling.py) survive a
backend restart, and what lets a chat resume across separate HTTP requests
without the frontend re-sending history.

Uses psycopg (v3) async, not the psycopg2 driver the rest of the app's sync
tooling (Alembic) uses -- langgraph-checkpoint-postgres requires it, and the
async variant specifically because the rest of this app (SQLAlchemy's
AsyncSession, FastAPI's async routes) is async throughout; the graph is
invoked with .ainvoke(), which needs an async-capable checkpointer.

The checkpointer manages its own tables (`checkpoints`, `checkpoint_writes`,
...) via .setup(); that schema is intentionally NOT part of the Alembic
migration chain -- it belongs to LangGraph, not this app's domain model.
"""

import asyncio

import psycopg
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row

from app.config import get_settings

_saver: AsyncPostgresSaver | None = None
_lock = asyncio.Lock()


def _psycopg_conn_string() -> str:
    # SYNC_DATABASE_URL is "postgresql+psycopg2://..." (for SQLAlchemy/Alembic);
    # psycopg (v3) wants the driver-less "postgresql://..." form.
    return get_settings().sync_database_url.replace("postgresql+psycopg2://", "postgresql://", 1)


async def get_checkpointer() -> AsyncPostgresSaver:
    """One long-lived async connection for the process's lifetime, tables
    created on first use if missing."""
    global _saver
    if _saver is not None:
        return _saver
    async with _lock:
        if _saver is None:
            conn = await psycopg.AsyncConnection.connect(
                _psycopg_conn_string(), autocommit=True, prepare_threshold=0, row_factory=dict_row
            )
            saver = AsyncPostgresSaver(conn)
            await saver.setup()
            _saver = saver
    return _saver
