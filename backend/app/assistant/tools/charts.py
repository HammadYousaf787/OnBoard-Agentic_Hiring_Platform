"""Renders a chart from data the agent already pulled with its other tools
and stores it the same way every other file in this app is stored: bytes in
MinIO, only the pointer (here, a presigned URL) returned -- no base64 images
passed around in the conversation."""

import io
import uuid
from typing import Annotated, Literal

import matplotlib

matplotlib.use("Agg")  # headless -- this process never opens a display
import matplotlib.pyplot as plt
from langgraph.prebuilt import InjectedState
from langchain_core.tools import tool

from app.assistant.state import HrAssistantState
from app.assistant.tools._actions import attachment
from app.core.storage import get_cv_download_url, put_bytes


@tool(response_format="content_and_artifact")
def generate_chart(
    title: str,
    labels: list[str],
    values: list[float],
    chart_type: Literal["bar", "line", "pie"],
    state: Annotated[HrAssistantState, InjectedState],
) -> tuple[str, list[dict]]:
    """Render a chart from labels + numeric values you already retrieved
    with another tool (e.g. applicant counts by stage). The image is attached
    to your reply automatically -- do NOT paste any link. labels and values
    must be the same length."""
    if len(labels) != len(values):
        return "labels and values must have the same length.", []
    if not labels:
        return "Nothing to chart -- no data was provided.", []

    fig, ax = plt.subplots(figsize=(7, 4.5))
    if chart_type == "bar":
        ax.bar(labels, values, color="#4f46e5")
        ax.set_ylabel("Count")
        plt.xticks(rotation=30, ha="right")
    elif chart_type == "line":
        ax.plot(labels, values, marker="o", color="#4f46e5")
        plt.xticks(rotation=30, ha="right")
    else:
        ax.pie(values, labels=labels, autopct="%1.0f%%")
    ax.set_title(title)
    fig.tight_layout()

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=150)
    plt.close(fig)
    buffer.seek(0)

    hr_id = state["hr_id"]
    object_key = f"assistant-charts/{hr_id}/{uuid.uuid4()}.png"
    put_bytes(object_key, buffer.getvalue(), "image/png")
    url = get_cv_download_url(object_key, "chart.png", inline=True, expires_minutes=60)
    return "Chart attached to the reply.", [attachment(f"{title}.png", url, kind="image")]


CHART_TOOLS = [generate_chart]
