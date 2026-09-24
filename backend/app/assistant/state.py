"""The graph's shared state. Every node reads/returns a partial update of this."""

from typing import Annotated

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class HrAssistantState(TypedDict):
    # `add_messages` appends new messages instead of overwriting the list --
    # the standard reducer for chat state.
    messages: Annotated[list, add_messages]

    # Set once per invocation from the authenticated request (see routers/assistant.py).
    # Tools read this via LangGraph's InjectedState -- it is never part of any
    # tool's JSON schema, so the model can never see or spoof another HR's id.
    hr_id: str

    # The HR's IANA timezone (e.g. "Asia/Karachi"), sent by the browser with
    # each message. Interview times are stored in UTC, but HR speak in local
    # time -- tools use this to read/print times locally (see tools/_actions.py).
    tz: str
