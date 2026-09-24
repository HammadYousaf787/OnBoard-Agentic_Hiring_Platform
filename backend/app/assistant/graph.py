"""Builds and compiles the HR assistant's graph. See GRAPH.txt in this
folder for the full explanation of why it's shaped this way.

The graph itself is a standard two-node ReAct loop (agent <-> tools); the
interesting behaviour (human-in-the-loop confirmation for scheduling) lives
inside a tool (tools/scheduling.py), not as extra graph structure -- see
GRAPH.txt for why that's the idiomatic LangGraph pattern here.
"""

import asyncio

from langchain_core.messages import SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from app.assistant.checkpointer import get_checkpointer
from app.assistant.model import get_llm
from app.integrations.openai_client import NO_TEMPERATURE, is_temperature_rejection, model_for
from app.assistant.prompts import system_prompt
from app.assistant.state import HrAssistantState
from app.assistant.tools import ALL_TOOLS


def _llm():
    # One tool call at a time: a batch tool that pauses for confirmation
    # (interrupt) can't safely run alongside other tool calls in parallel,
    # and the write tools already take lists, so parallelism buys little.
    return get_llm().bind_tools(ALL_TOOLS, parallel_tool_calls=False)


async def _agent_node(state: HrAssistantState) -> dict:
    messages = [SystemMessage(content=system_prompt(state.get("tz"))), *state["messages"]]
    try:
        response = await _llm().ainvoke(messages)
    except Exception as exc:  # noqa: BLE001
        if not is_temperature_rejection(exc):
            raise
        # This model rejects `temperature`: remember that and retry once without it.
        NO_TEMPERATURE.add(model_for("hr_assistant"))
        response = await _llm().ainvoke(messages)
    return {"messages": [response]}


_graph = None
_lock = asyncio.Lock()


async def get_graph():
    """Compiled once per process; only per-thread state changes per request."""
    global _graph
    if _graph is not None:
        return _graph
    async with _lock:
        if _graph is None:
            builder = StateGraph(HrAssistantState)
            builder.add_node("agent", _agent_node)
            builder.add_node("tools", ToolNode(ALL_TOOLS))

            builder.add_edge(START, "agent")
            builder.add_conditional_edges("agent", tools_condition, {"tools": "tools", "__end__": END})
            builder.add_edge("tools", "agent")

            _graph = builder.compile(checkpointer=await get_checkpointer())
    return _graph
