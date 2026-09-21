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

    # AI review pipeline
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-flash-latest"
    github_token: str | None = None
    brightdata_api_token: str | None = None

    # Agora video interviews (certificate must stay server-side)
    agora_app_id: str | None = None
    agora_app_certificate: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
