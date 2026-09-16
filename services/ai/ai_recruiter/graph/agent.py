"""LangGraph interview state machine.

Falls back to ConversationManager sequential flow if langgraph graph compile fails.
"""
from __future__ import annotations

from typing import Any, TypedDict

from ai_recruiter.conversation import ConversationManager
from ai_recruiter.schemas import InterviewState


class GraphState(TypedDict, total=False):
    interview: dict[str, Any]
    context: dict[str, Any]
    utterance: str
    reply: str
    meta: dict[str, Any]
    phase: str


def build_interview_graph(manager: ConversationManager):
    try:
        from langgraph.graph import END, StateGraph
    except Exception:
        return None

    async def load_context(state: GraphState) -> GraphState:
        state["phase"] = "LOAD_CONTEXT"
        return state

    async def validate_context(state: GraphState) -> GraphState:
        ctx = state.get("context") or {}
        if not ctx.get("job_id") or not ctx.get("candidate_id"):
            state["phase"] = "INVALID"
            state["reply"] = "Missing interview context."
            return state
        state["phase"] = "VALIDATE_CONTEXT"
        return state

    async def introduction(state: GraphState) -> GraphState:
        interview = InterviewState.model_validate(state["interview"])
        interview, reply = await manager.start(interview, state.get("context") or {})
        state["interview"] = interview.model_dump()
        state["reply"] = reply
        state["phase"] = "INTRODUCTION"
        return state

    async def process_turn(state: GraphState) -> GraphState:
        interview = InterviewState.model_validate(state["interview"])
        interview, reply, meta = await manager.process_answer(
            interview, state.get("utterance") or "", state.get("context") or {}
        )
        state["interview"] = interview.model_dump()
        state["reply"] = reply
        state["meta"] = meta
        state["phase"] = meta.get("action", "TURN")
        return state

    async def finalize(state: GraphState) -> GraphState:
        interview = InterviewState.model_validate(state["interview"])
        report = await manager.finish(interview, state.get("context") or {})
        state["meta"] = {**(state.get("meta") or {}), "report": report.model_dump()}
        state["phase"] = "REPORT_GENERATION"
        return state

    graph = StateGraph(GraphState)
    graph.add_node("load_context", load_context)
    graph.add_node("validate_context", validate_context)
    graph.add_node("introduction", introduction)
    graph.add_node("process_turn", process_turn)
    graph.add_node("finalize", finalize)

    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "validate_context")

    def route_after_validate(state: GraphState) -> str:
        if state.get("phase") == "INVALID":
            return END
        if (state.get("meta") or {}).get("mode") == "start":
            return "introduction"
        if (state.get("meta") or {}).get("mode") == "finish":
            return "finalize"
        return "process_turn"

    graph.add_conditional_edges("validate_context", route_after_validate)
    graph.add_edge("introduction", END)
    graph.add_edge("process_turn", END)
    graph.add_edge("finalize", END)
    return graph.compile()


class InterviewAgent:
    def __init__(self, manager: ConversationManager) -> None:
        self.manager = manager
        self.graph = build_interview_graph(manager)

    async def start(self, state: InterviewState, context: dict[str, Any]) -> tuple[InterviewState, str]:
        # Manager is source of truth; graph is optional orchestration.
        return await self.manager.start(state, context)

    async def turn(
        self, state: InterviewState, utterance: str, context: dict[str, Any]
    ) -> tuple[InterviewState, str, dict[str, Any]]:
        return await self.manager.process_answer(state, utterance, context)

    async def finish(self, state: InterviewState, context: dict[str, Any]):
        return await self.manager.finish(state, context)
