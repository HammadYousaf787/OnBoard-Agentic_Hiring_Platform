import io
import re
import uuid
from datetime import timedelta
from functools import lru_cache

from minio import Minio
from minio.commonconfig import CopySource
from minio.error import S3Error

from app.config import get_settings

settings = get_settings()

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


@lru_cache
def get_minio_client() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_bucket_exists() -> None:
    client = get_minio_client()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def _safe_filename(filename: str) -> str:
    return _SAFE_NAME_RE.sub("_", filename) or "file"


def upload_cv(file_bytes: bytes, original_filename: str, content_type: str) -> str:
    """Uploads a CV to MinIO and returns its object key."""
    client = get_minio_client()
    object_key = f"cvs/{uuid.uuid4()}-{_safe_filename(original_filename)}"
    client.put_object(
        settings.minio_bucket,
        object_key,
        data=io.BytesIO(file_bytes),
        length=len(file_bytes),
        content_type=content_type or "application/octet-stream",
    )
    return object_key


def get_cv_download_url(
    object_key: str, file_name: str | None = None, inline: bool = False, expires_minutes: int = 15
) -> str:
    """Presigned GET URL. inline=True asks the browser to render the file
    (PDF/text viewer); otherwise it downloads under the original file name."""
    client = get_minio_client()
    disposition = "inline" if inline else "attachment"
    if file_name:
        disposition += f'; filename="{_safe_filename(file_name)}"'
    return client.presigned_get_object(
        settings.minio_bucket,
        object_key,
        expires=timedelta(minutes=expires_minutes),
        response_headers={"response-content-disposition": disposition},
    )


def copy_cv_to_bank(object_key: str) -> str:
    """Copies an applicant's CV into the separate cv-bank/ area and returns the
    new key, so the CV bank entry owns its file independently of the
    applicant/job it came from."""
    client = get_minio_client()
    name = object_key.rsplit("/", 1)[-1]
    if len(name) > 37 and name[36] == "-":  # drop the original upload's uuid prefix
        name = name[37:]
    new_key = f"cv-bank/{uuid.uuid4()}-{name}"
    client.copy_object(settings.minio_bucket, new_key, CopySource(settings.minio_bucket, object_key))
    return new_key


def delete_cv(object_key: str) -> None:
    client = get_minio_client()
    try:
        client.remove_object(settings.minio_bucket, object_key)
    except S3Error:
        # Already gone / never existed -- deleting is idempotent from the
        # caller's point of view.
        pass


def put_bytes(object_key: str, data: bytes, content_type: str) -> None:
    client = get_minio_client()
    client.put_object(
        settings.minio_bucket, object_key, data=io.BytesIO(data), length=len(data), content_type=content_type
    )


def put_file(object_key: str, fileobj, size: int, content_type: str) -> None:
    client = get_minio_client()
    client.put_object(settings.minio_bucket, object_key, data=fileobj, length=size, content_type=content_type)


def get_bytes(object_key: str) -> bytes:
    client = get_minio_client()
    response = client.get_object(settings.minio_bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_prefix(prefix: str) -> None:
    client = get_minio_client()
    try:
        for obj in client.list_objects(settings.minio_bucket, prefix=prefix, recursive=True):
            client.remove_object(settings.minio_bucket, obj.object_name)
    except S3Error:
        pass
