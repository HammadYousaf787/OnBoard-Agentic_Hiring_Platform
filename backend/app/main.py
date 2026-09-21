from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.storage import ensure_bucket_exists
from app.routers import (
    ai_review,
    applicants,
    auth,
    cv_bank,
    interviews,
    jobs,
    public,
    public_interviews,
    users,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_bucket_exists()
    yield


app = FastAPI(
    title="Employee Onboarding Platform API",
    description="Backend for the onboarding platform: auth, jobs, applicants, "
    "interview scheduling and the CV bank.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, settings.apply_portal_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(jobs.router)
app.include_router(applicants.router)
app.include_router(cv_bank.router)
app.include_router(ai_review.router)
app.include_router(public.router)
app.include_router(interviews.router)
app.include_router(public_interviews.router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
