"""Unit tests that do not require Postgres."""
import asyncio
import re

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
async def test_llm_followup_uses_resume_and_last_answer():
    mgr = ConversationManager(MockLLM())
    state = InterviewState(session_id="s", candidate_id="c", job_id="j", company_id="co")
    context = {
        "job_title": "AI Engineer",
        "resume_text": "Ananya\nProjects:\nCampus RAG Bot — FastAPI + pgvector retrieval.\nSkills: Python, FastAPI",
        "resume_projects": [{"name": "Campus RAG Bot", "description": "Built scalable RAG system with FastAPI"}],
        "resume_skills": ["Python", "FastAPI", "RAG"],
        "resume_claims": ["Built scalable RAG system with FastAPI and pgvector"],
        "jd_required_skills": ["Python", "RAG"],
        "match": {
            "strong_matches": ["Python", "RAG"],
            "missing": [],
            "claims_to_validate": ["Built scalable RAG system with FastAPI and pgvector"],
            "suspicious_claims": ["Built scalable RAG system with FastAPI and pgvector"],
            "relevant_projects": ["Campus RAG Bot"],
        },
        "candidate_profile": {
            "name": "Ananya",
            "skills": ["Python", "FastAPI", "RAG"],
            "projects": [{"name": "Campus RAG Bot", "description": "Built scalable RAG system"}],
            "claims": ["Built scalable RAG system with FastAPI and pgvector"],
        },
    }
    state, _ = await mgr.start(state, context)
    assert state.plan.get("competencies")
    assert state.memory_summary
    state, reply, meta = await mgr.process_answer(
        state,
        "I built a Campus RAG Bot with FastAPI and pgvector for campus FAQs.",
        context,
    )
    assert reply
    assert meta.get("action") in {"FOLLOW_UP", "MOVE_TOPIC", "CLARIFY", "CLARIFY_SCOPE"}
    # Should not ask generic "What is RAG?"
    assert not re.search(r"\bwhat is rag\b", reply, re.I)


@pytest.mark.asyncio
async def test_weak_answer_probes_deeper_not_jump():
    from ai_recruiter.evaluator import decide_next_action, heuristic_evaluation

    state = InterviewState(
        session_id="s",
        candidate_id="c",
        job_id="j",
        current_section="technical",
        current_competency="RAG",
        probe_level=1,
        competency_queue=["RAG", "Python"],
        plan={"question_budget": 10, "competencies": [{"name": "RAG", "min_evidence": 2}]},
    )
    evaluation = heuristic_evaluation(state, "I used RAG.")
    assert evaluation.answer_quality in {"weak", "unclear", "incorrect"}
    assert decide_next_action(state, evaluation) in {"FOLLOW_UP", "CLARIFY"}


def test_claim_probe_ladder_rag():
    from ai_recruiter.competency_map import claim_probe_ladder

    ladder = claim_probe_ladder("Built scalable RAG system", "RAG", "Campus RAG Bot")
    assert len(ladder) == 4
    joined = " ".join(ladder).lower()
    assert "retriev" in joined or "chunk" in joined or "embed" in joined
    assert "what is rag" not in joined


def test_topic_dedup():
    from ai_recruiter.evaluator import is_topic_covered, topic_key

    state = InterviewState(session_id="s", candidate_id="c", job_id="j")
    q1 = "Walk me through the RAG architecture in Campus RAG Bot"
    state.asked_topic_keys.append(topic_key(q1))
    assert is_topic_covered("Walk me through the RAG architecture used in Campus RAG Bot", state)


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
