"""The chat model the assistant graph runs on. OpenAI-only for now (the
platform's other AI features -- applicant review, interview questions, live
assist -- use app/integrations/openai_client.py, each with its own model
setting; this one is model_for("hr_assistant"))."""

from functools import lru_cache

from langchain_openai import ChatOpenAI

from app.config import get_settings
from app.integrations.openai_client import NO_TEMPERATURE, model_for


@lru_cache
def _build(model: str, with_temperature: bool) -> ChatOpenAI:
    kwargs = {"temperature": 0.3} if with_temperature else {}
    return ChatOpenAI(
        model=model,
        api_key=get_settings().openai_api_key or "not-configured",
        **kwargs,
    )


def get_llm() -> ChatOpenAI:
    """Cached per (model, temperature-support). Constructing this makes no
    network call and doesn't validate the key -- that only happens on the
    first actual message. Models that reject `temperature` are remembered in
    NO_TEMPERATURE the first time one does (see graph.py's agent node)."""
    model = model_for("hr_assistant")
    return _build(model, model not in NO_TEMPERATURE)
