"""End-to-end interview flow using MockLLM (no external keys)."""
import pytest
from ai_recruiter import ConversationManager, InterviewAgent
from ai_recruiter.providers.llm import MockLLM
from ai_recruiter.schemas import InterviewState


@pytest.mark.asyncio
async def test_e2e_text_interview_to_report():
    agent = InterviewAgent(ConversationManager(MockLLM()))
    state = InterviewState(
        session_id="e2e",
        candidate_id="c1",
        job_id="j1",
        company_id="co1",
        time_remaining=900,
    )
    context = {
        "job_title": "AI Engineer",
        "duration_minutes": 15,
        "competencies": {"Python": 20, "RAG": 40, "Communication": 40},
        "match": {"claims_to_validate": ["Built production RAG system"], "missing": ["Kafka"]},
        "mandatory_questions": [],
    }
    state, intro = await agent.start(state, context)
    assert "interview" in intro.lower() or "AI" in intro or len(intro) > 10

    state, reply, meta = await agent.turn(
        state,
        "I built CreatorOS with chunking, embeddings, vector retrieval, and an evaluation harness for hit-rate.",
        context,
    )
    assert reply
    assert meta.get("evaluation") or meta.get("action")

    state, reply2, meta2 = await agent.turn(
        state,
        "For failures we used retries and fallback keyword search. Monitoring covered latency and empty retrieval rate.",
        context,
    )
    assert reply2

    # force end via finish
    report = await agent.finish(state, context)
    assert report.overall_score is not None
    assert report.recommendation
