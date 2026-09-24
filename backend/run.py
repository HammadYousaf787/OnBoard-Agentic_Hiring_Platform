"""Entry point for running the API -- use this instead of `python -m uvicorn
app.main:app` on Windows.

Why this file exists: `python -m uvicorn ...` calls asyncio.run() (which
creates the process's event loop) *before* app.main is ever imported, so
setting the event loop policy inside app.main happens too late -- the loop
already exists by then. Setting it here, before uvicorn.run() is called,
is the only point early enough for it to take effect.

Needed because psycopg (v3), used by the LangGraph assistant's checkpointer
(app/assistant/checkpointer.py), cannot run in async mode on Windows'
default ProactorEventLoop.
"""

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000)
