import time

from agora_token_builder import RtcTokenBuilder

from app.config import get_settings

INTERVIEWER_UID = 1
APPLICANT_UID = 2
_ROLE_PUBLISHER = 1
TOKEN_TTL_SECONDS = 4 * 60 * 60


class AgoraNotConfigured(Exception):
    pass


def channel_for(appointment_id) -> str:
    return f"interview-{appointment_id}"


def build_rtc_credentials(channel: str, uid: int) -> dict:
    """App ID + short-lived RTC token for one participant. The App Certificate
    never leaves the backend; only the derived token is returned."""
    settings = get_settings()
    if not settings.agora_app_id or not settings.agora_app_certificate:
        raise AgoraNotConfigured("AGORA_APP_ID / AGORA_APP_CERTIFICATE are not configured.")
    expires_at = int(time.time()) + TOKEN_TTL_SECONDS
    token = RtcTokenBuilder.buildTokenWithUid(
        settings.agora_app_id, settings.agora_app_certificate, channel, uid, _ROLE_PUBLISHER, expires_at
    )
    return {"app_id": settings.agora_app_id, "channel": channel, "uid": uid, "token": token}
