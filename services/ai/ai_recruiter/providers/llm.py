"""Provider abstractions and LLM implementations."""
from __future__ import annotations

import hashlib
import json
import re
import time
from abc import ABC, abstractmethod
from typing import Any, Optional, Type, TypeVar

from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

T = TypeVar("T", bound=BaseModel)


class LLMProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        meta: Optional[dict[str, Any]] = None,
    ) -> str:
        raise NotImplementedError

    async def structured_output(
        self,
        messages: list[dict[str, str]],
        schema: Type[T],
        *,
        temperature: float = 0.1,
        max_tokens: int = 4096,
        meta: Optional[dict[str, Any]] = None,
    ) -> T:
        instruction = (
            messages
            + [
                {
                    "role": "user",
                    "content": (
                        "Respond with ONLY valid JSON matching this schema. "
                        f"Schema: {json.dumps(schema.model_json_schema())}"
                    ),
                }
            ]
        )
        raw = await self.generate(instruction, temperature=temperature, max_tokens=max_tokens, meta=meta)
        data = _extract_json(raw)
        return schema.model_validate(data)


class OpenAICompatibleLLM(LLMProvider):
    def __init__(self, api_key: str, base_url: str, model: str, fallback_model: str = "") -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.fallback_model = fallback_model or model

    @retry(wait=wait_exponential(multiplier=1, min=1, max=8), stop=stop_after_attempt(3), reraise=True)
    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        meta: Optional[dict[str, Any]] = None,
    ) -> str:
        import httpx

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            if resp.status_code >= 400 and self.fallback_model != self.model:
                payload["model"] = self.fallback_model
                resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]


class MockLLM(LLMProvider):
    """Deterministic local LLM for development without API keys."""

    async def generate(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        meta: Optional[dict[str, Any]] = None,
    ) -> str:
        blob = " ".join(m.get("content", "") for m in messages).lower()
        prompt_name = (meta or {}).get("prompt_name", "")

        if "resume" in prompt_name or "parse the following resume" in blob:
            return json.dumps(_mock_resume())
        if "job description" in blob or "jd_analyzer" in prompt_name:
            return json.dumps(_mock_jd())
        if "match" in prompt_name or "strong_matches" in blob:
            return json.dumps(_mock_match())
        if "interview plan" in blob or "interview_planner" in prompt_name:
            return json.dumps(_mock_plan())
        if "next_action" in prompt_name or "recommended_action" in blob or "followup_needed" in blob:
            return json.dumps(
                {
                    "correctness": 0.7,
                    "depth": 0.55,
                    "missing_concepts": ["evaluation", "reranking"],
                    "followup_needed": True,
                    "recommended_action": "FOLLOW_UP",
                }
            )
        if "evaluate" in prompt_name or ("answer_evaluator" in prompt_name) or (
            "correctness" in blob and "missing_points" in blob
        ):
            return json.dumps(_mock_eval())
        if "report" in prompt_name:
            return json.dumps(_mock_report())
        if "guardrail" in prompt_name:
            return json.dumps({"allowed": True, "reasons": [], "sanitized_text": None})
        if "classify" in blob or "candidate_question" in prompt_name:
            if "weather" in blob:
                return json.dumps({"intent": "OFF_TOPIC", "reply": "Let's stay focused on the interview."})
            if "which project" in blob or "which one" in blob:
                return json.dumps(
                    {
                        "intent": "CLARIFICATION",
                        "reply": "Let's pick a specific project from your resume.",
                    }
                )
            return json.dumps({"intent": "CLARIFICATION", "reply": "I mean your practical approach and trade-offs."})
        if (
            "question" in prompt_name
            or "generate a technical interview question" in blob
            or "generate one interview question" in blob
            or "last answer:" in blob
            or "full resume:" in blob
        ):
            # Try to ground in resume projects / skills from the prompt itself
            project = None
            for marker in ("creatoros", "built ", "project"):
                if marker in blob:
                    # pull a likely project token
                    if "creatoros" in blob:
                        project = "CreatorOS"
                        break
            m = re.search(r"resume projects:\s*(\[.*?\])", blob, re.I | re.S)
            if m:
                try:
                    arr = json.loads(m.group(1).replace("'", '"'))
                    if arr and isinstance(arr, list):
                        first = arr[0]
                        project = first.get("name") if isinstance(first, dict) else str(first)
                except Exception:
                    pass
            if project:
                return json.dumps(
                    {
                        "question": f"On your resume you mention {project}. Walk me through the architecture and your contributions.",
                        "competency": "resume",
                        "difficulty": "medium",
                        "expected_concepts": ["architecture", "ownership", "impact"],
                        "source": "resume",
                    }
                )
            skill_m = re.search(r"jd required skills:\s*(\[.*?\])", blob, re.I | re.S)
            skill = "Python"
            if skill_m:
                try:
                    skills = json.loads(skill_m.group(1).replace("'", '"'))
                    if skills:
                        skill = skills[0]
                except Exception:
                    pass
            return json.dumps(
                {
                    "question": f"This role needs strong {skill}. Where have you used {skill} most recently, and what trade-offs did you make?",
                    "competency": skill,
                    "difficulty": "medium",
                    "expected_concepts": [skill, "tradeoffs"],
                    "source": "jd",
                }
            )
        # Generic interviewer utterance
        return "Thanks — that helps. Can you go one level deeper on how you evaluated quality?"


def _extract_json(raw: str) -> Any:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}|\[.*\]", raw, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def _mock_resume() -> dict[str, Any]:
    return {
        "candidate_name": "Alex Rivera",
        "email": "alex.rivera@example.com",
        "phone": "+1-555-0100",
        "summary": "AI engineer with production LLM and RAG experience.",
        "skills": ["Python", "FastAPI", "LLMs", "RAG", "PostgreSQL", "Docker"],
        "experience": [
            {
                "title": "AI Engineer",
                "company": "Nimbus Labs",
                "bullets": ["Built CreatorOS using Python, LLMs and RAG."],
            }
        ],
        "education": [{"degree": "B.S. Computer Science", "school": "State University"}],
        "projects": [{"name": "CreatorOS", "description": "Production RAG assistant for creators."}],
        "certifications": [],
        "achievements": ["Reduced retrieval latency 35%"],
        "source_evidence": {"skills": "Python, FastAPI, LLMs, RAG"},
    }


def _mock_jd() -> dict[str, Any]:
    return {
        "title": "AI Engineer",
        "required_skills": ["Python", "FastAPI", "LLMs", "RAG", "PostgreSQL"],
        "preferred_skills": ["Kubernetes", "Kafka", "LangGraph"],
        "experience": "3+ years building AI/backend systems",
        "responsibilities": [
            "Design and ship LLM features",
            "Build retrieval-augmented generation pipelines",
            "Own evaluation and reliability",
        ],
        "technical_competencies": ["Python", "Backend", "LLMs", "RAG", "System Design"],
        "behavioral_competencies": ["Communication", "Ownership"],
    }


def _mock_match() -> dict[str, Any]:
    return {
        "strong_matches": ["Python", "FastAPI", "LLMs", "RAG"],
        "partial_matches": ["Kubernetes"],
        "missing": ["Kafka"],
        "claims_to_validate": ["Built production RAG system"],
        "relevant_projects": ["CreatorOS"],
        "potential_interview_areas": ["RAG evaluation", "System design", "Backend APIs"],
    }


def _mock_plan() -> dict[str, Any]:
    return {
        "duration_minutes": 30,
        "sections": ["introduction", "resume", "technical", "system_design", "behavioral", "candidate_questions"],
        "competency_coverage": {"Python": 15, "Backend": 15, "LLMs": 20, "RAG": 20, "System Design": 20, "Communication": 10},
        "question_budget": 8,
        "difficulty_strategy": "adaptive",
        "mandatory_questions": [],
        "resume_claims_to_validate": ["Built production RAG system"],
    }


def _mock_eval() -> dict[str, Any]:
    return {
        "competencies": ["RAG"],
        "correctness": 4,
        "depth": 3,
        "reasoning": 4,
        "clarity": 4,
        "evidence": ["Explained semantic retrieval clearly"],
        "missing_points": ["Independent retrieval evaluation", "Reranking"],
        "confidence": 0.86,
        "status": "scored",
    }


def _mock_report() -> dict[str, Any]:
    return {
        "overall_score": 82,
        "recommendation": "yes",
        "strengths": ["Strong Python", "Good practical LLM understanding"],
        "weaknesses": ["Limited RAG evaluation depth"],
        "evidence": [
            "Candidate correctly explained semantic retrieval but could not clearly explain independent retrieval evaluation."
        ],
        "resume_validation": [
            {
                "claim": "Built production RAG system",
                "status": "PARTIALLY_VERIFIED",
                "evidence": "Explained ingestion and retrieval; weak on production evaluation.",
            }
        ],
        "technical_gaps": ["Reranking", "Retrieval evaluation"],
        "behavioral_observations": ["Clear communicator"],
        "recommended_next_step": "Proceed to hiring manager round focusing on RAG evaluation.",
        "competency_scores": {
            "Python": 90,
            "Backend": 84,
            "LLMs": 88,
            "RAG": 72,
            "System Design": 78,
            "Communication": 86,
        },
    }


def build_llm(provider: str, api_key: str, base_url: str, model: str, fallback: str) -> LLMProvider:
    if not api_key or provider == "mock":
        return MockLLM()
    return OpenAICompatibleLLM(api_key=api_key, base_url=base_url, model=model, fallback_model=fallback)


def stable_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


class TraceRecord(BaseModel):
    prompt_name: str = ""
    prompt_version: str = ""
    model: str = ""
    latency_ms: int = 0
    success: bool = True
