from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ResumeProfile(BaseModel):
    candidate_name: str = ""
    email: str = ""
    phone: str = ""
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experience: list[dict[str, Any]] = Field(default_factory=list)
    education: list[dict[str, Any]] = Field(default_factory=list)
    projects: list[dict[str, Any]] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    claims: list[str] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    source_evidence: dict[str, Any] = Field(default_factory=dict)


class JobProfileExtract(BaseModel):
    title: str = ""
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    experience: str = ""
    seniority: str = ""
    responsibilities: list[str] = Field(default_factory=list)
    technical_competencies: list[str] = Field(default_factory=list)
    behavioral_competencies: list[str] = Field(default_factory=list)


class MatchResult(BaseModel):
    strong_matches: list[str] = Field(default_factory=list)
    partial_matches: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    claims_to_validate: list[str] = Field(default_factory=list)
    suspicious_claims: list[str] = Field(default_factory=list)
    relevant_projects: list[str] = Field(default_factory=list)
    potential_interview_areas: list[str] = Field(default_factory=list)


class InterviewPlan(BaseModel):
    duration_minutes: int = 30
    sections: list[str] = Field(default_factory=list)
    competency_coverage: dict[str, float] = Field(default_factory=dict)
    question_budget: int = 8
    difficulty_strategy: str = "adaptive"
    mandatory_questions: list[str] = Field(default_factory=list)
    resume_claims_to_validate: list[str] = Field(default_factory=list)
    competencies: list[dict[str, Any]] = Field(default_factory=list)
    claims: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)
    suspicious_claims: list[str] = Field(default_factory=list)
    seniority: str = ""
    candidate_profile: dict[str, Any] = Field(default_factory=dict)


class GeneratedQuestion(BaseModel):
    question: str
    competency: str = "general"
    difficulty: str = "medium"
    expected_concepts: list[str] = Field(default_factory=list)
    source: str = "generated"


class AnswerAnalysis(BaseModel):
    correctness: float = 0.0
    depth: float = 0.0
    missing_concepts: list[str] = Field(default_factory=list)
    followup_needed: bool = False
    recommended_action: str = "MOVE_TOPIC"


class EvaluationResult(BaseModel):
    competencies: list[str] = Field(default_factory=list)
    correctness: int = 0
    depth: int = 0
    reasoning: int = 0
    clarity: int = 0
    evidence: list[str] = Field(default_factory=list)
    missing_points: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    status: str = "scored"
    quote: str = ""
    probe_hint: str = ""
    score_0_to_5: float = 0.0
    answer_quality: Literal["weak", "ok", "strong", "incorrect", "unclear"] = "ok"
    enough_evidence: bool = False


class GuardrailResult(BaseModel):
    allowed: bool = True
    reasons: list[str] = Field(default_factory=list)
    sanitized_text: Optional[str] = None


class CandidateIntent(BaseModel):
    intent: Literal[
        "INTERVIEW_RELATED",
        "ROLE_RELATED",
        "COMPANY_INFORMATION",
        "PROCESS_INFORMATION",
        "CLARIFICATION",
        "OFF_TOPIC",
        "UNSAFE",
        "UNKNOWN",
    ] = "UNKNOWN"
    reply: str = ""


class ReportDraft(BaseModel):
    overall_score: float = 0.0
    recommendation: str = "insufficient_evidence"
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    resume_validation: list[dict[str, Any]] = Field(default_factory=list)
    technical_gaps: list[str] = Field(default_factory=list)
    behavioral_observations: list[str] = Field(default_factory=list)
    recommended_next_step: str = ""
    competency_scores: dict[str, float] = Field(default_factory=dict)


class InterviewState(BaseModel):
    session_id: str
    candidate_id: str
    job_id: str
    company_id: str = ""
    current_section: str = "introduction"
    current_competency: str = ""
    questions_asked: int = 0
    questions_remaining: list[str] = Field(default_factory=list)
    topics_covered: dict[str, int] = Field(default_factory=dict)
    competency_scores: dict[str, float] = Field(default_factory=dict)
    followups_used: int = 0
    time_remaining: int = 1800
    conversation_history: list[dict[str, str]] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)
    difficulty: str = "medium"
    paused: bool = False
    last_question: str = ""
    plan: dict[str, Any] = Field(default_factory=dict)
    claims_status: dict[str, str] = Field(default_factory=dict)
    pending_mandatory: list[str] = Field(default_factory=list)
    probe_level: int = 0
    current_claim: str = ""
    current_project: str = ""
    competency_queue: list[str] = Field(default_factory=list)
    evidence_log: list[dict[str, Any]] = Field(default_factory=list)
    competency_evidence: dict[str, list[str]] = Field(default_factory=dict)
    # Structured state — not chat history alone
    asked_questions: list[str] = Field(default_factory=list)
    asked_topic_keys: list[str] = Field(default_factory=list)
    evidence_counts: dict[str, int] = Field(default_factory=dict)
    memory_summary: str = ""
    candidate_profile: dict[str, Any] = Field(default_factory=dict)
    last_action: str = ""
    consecutive_strong: int = 0
    consecutive_weak: int = 0
