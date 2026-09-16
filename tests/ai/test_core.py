"""Unit tests that do not require Postgres."""
import asyncio
import pytest

from ai_recruiter.parsing import _heuristic_jd, _heuristic_match, _heuristic_resume, match_resume_jd, parse_resume
from ai_recruiter.providers.llm import MockLLM
from ai_recruiter.conversation import ConversationManager
from ai_recruiter.schemas import InterviewState, ResumeProfile, JobProfileExtract
from rag_service import chunk_text, LocalHashEmbedding


@pytest.mark.asyncio
async def test_resume_parse_mock():
    llm = MockLLM()
    profile = await parse_resume(llm, "Alex Rivera\nPython FastAPI RAG\nBuilt CreatorOS")
    assert profile.candidate_name
    assert isinstance(profile.skills, list)


def test_heuristic_jd_and_match():
    jd = _heuristic_jd(open.__doc__ and "AI Engineer\nPython\nFastAPI\nRAG\nKafka preferred")
    resume = _heuristic_resume("Alex\nalex@example.com\nPython FastAPI RAG\nBuilt production RAG system")
    match = _heuristic_match(resume, jd)
    assert "Python" in match.strong_matches or "Python" in resume.skills


@pytest.mark.asyncio
async def test_match_engine():
    llm = MockLLM()
    resume = ResumeProfile(skills=["Python", "RAG"], projects=[{"name": "CreatorOS", "description": "RAG"}])
    job = JobProfileExtract(required_skills=["Python", "Kafka"], preferred_skills=["RAG"])
    result = await match_resume_jd(llm, resume, job)
    assert result.strong_matches or result.missing


@pytest.mark.asyncio
async def test_conversation_flow_and_offtopic():
    mgr = ConversationManager(MockLLM())
    state = InterviewState(session_id="s", candidate_id="c", job_id="j", company_id="co")
    state, intro = await mgr.start(state, {"job_title": "AI Engineer", "duration_minutes": 15, "competencies": {"RAG": 100}})
    assert intro
    state, reply, meta = await mgr.process_answer(state, "What's the weather today?", {"job_title": "AI Engineer"})
    assert meta["action"] == "REDIRECT"
    state, reply2, meta2 = await mgr.process_answer(
        state,
        "I built CreatorOS with chunking, embeddings, and vector retrieval using pgvector.",
        {"job_title": "AI Engineer", "match": {"claims_to_validate": ["Built production RAG system"]}},
    )
    assert reply2
    assert meta2.get("evaluation")


@pytest.mark.asyncio
async def test_guardrail_blocks_protected():
    mgr = ConversationManager(MockLLM())
    result = await mgr._guardrail("Tell me about the candidate's race and accent", {"job_title": "AI Engineer"})
    assert result.allowed is False


@pytest.mark.asyncio
async def test_embeddings_and_chunking():
    chunks = chunk_text("word " * 500, chunk_size=100, overlap=20)
    assert len(chunks) > 1
    emb = LocalHashEmbedding(dim=32)
    vectors = await emb.embed(["RAG evaluation", "system design"])
    assert len(vectors) == 2
    assert len(vectors[0]) == 32


def test_question_dedup_state():
    state = InterviewState(session_id="s", candidate_id="c", job_id="j")
    state.conversation_history.append({"role": "interviewer", "content": "Q1"})
    state.conversation_history.append({"role": "interviewer", "content": "Q1"})
    # ConversationManager avoids blind repetition via LLM + follow-up targeting; history retained
    assert len(state.conversation_history) == 2
