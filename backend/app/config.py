from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"

    # Database
    database_url: str
    sync_database_url: str

    # MinIO
    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_secure: bool = False
    minio_bucket: str = "candidate-cvs"

    # Auth
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # CORS
    frontend_origin: str = "http://localhost:3000"
    apply_portal_origin: str = "http://localhost:3001"

    # AI review pipeline (applicant review, interview questions, live assist,
    # and the HR assistant agent all use this one OpenAI account)
    openai_api_key: str | None = None
    # One model per task (chosen from a measured probe -- see MODEL_PROBE.txt).
    # Scoring and interview prep are cheap structured-JSON jobs -> nano;
    # the chatbot does multi-step tool calling -> a bigger model.
    openai_model_scoring: str = "gpt-5.4-nano"
    openai_model_interview_prep: str = "gpt-5.4-nano"
    openai_model_live_assist: str = "gpt-5.4-nano"
    openai_model_assistant: str = "gpt-5.4"
    # Speech-to-text for the assistant's mic button (audio -> text, then the
    # text goes through the normal chat model above).
    openai_model_transcribe: str = "gpt-4o-mini-transcribe"
    # Live interview: speech-to-text of both speakers' audio, and the model that
    # judges each answered question (a judgement task -> mini rather than nano).
    openai_model_interview_transcribe: str = "gpt-4o-mini-transcribe"
    openai_model_qa_analysis: str = "gpt-5.4-mini"
    # Separate Admin API key (org-level, "api.usage.read" scope) used only to
    # show real account usage on the admin AI usage panel -- optional, and
    # distinct from openai_api_key, which is what actually makes AI calls.
    openai_admin_api_key: str | None = None
    openai_org_id: str | None = None
    github_token: str | None = None
    brightdata_api_token: str | None = None

    # Agora video interviews (certificate must stay server-side)
    agora_app_id: str | None = None
    agora_app_certificate: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
