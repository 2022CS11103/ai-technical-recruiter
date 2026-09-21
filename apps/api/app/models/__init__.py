"""SQLAlchemy models for AI Technical Recruiter."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

try:
    from pgvector.sqlalchemy import Vector as PgVector
except Exception:  # pragma: no cover
    PgVector = None

# Portable JSON (JSONType on Postgres via dialect, JSON elsewhere)
JSONType = JSON


def embedding_column(dim: int = 384):
    if PgVector is not None:
        return mapped_column(PgVector(dim), nullable=True)
    return mapped_column(JSON, nullable=True)


class Base(DeclarativeBase):
    pass


class UserRole(str, enum.Enum):
    recruiter = "recruiter"
    candidate = "candidate"
    admin = "admin"


class InterviewStatus(str, enum.Enum):
    draft = "draft"
    scheduled = "scheduled"
    in_progress = "in_progress"
    paused = "paused"
    completed = "completed"
    cancelled = "cancelled"


class Recommendation(str, enum.Enum):
    strong_yes = "strong_yes"
    yes = "yes"
    maybe = "maybe"
    no = "no"
    insufficient_evidence = "insufficient_evidence"


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.recruiter, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    memberships: Mapped[list["CompanyMembership"]] = relationship(back_populates="user")


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    retention_days: Mapped[int] = mapped_column(Integer, default=365)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    memberships: Mapped[list["CompanyMembership"]] = relationship(back_populates="company")
    jobs: Mapped[list["Job"]] = relationship(back_populates="company")


class CompanyMembership(Base):
    __tablename__ = "company_memberships"
    __table_args__ = (UniqueConstraint("company_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.recruiter)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped["Company"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="memberships")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_jd_text: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(40), default="open")
    interview_duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    difficulty: Mapped[str] = mapped_column(String(40), default="adaptive")
    interview_style: Mapped[str] = mapped_column(String(80), default="technical")
    allow_pause: Mapped[bool] = mapped_column(Boolean, default=True)
    show_candidate_feedback: Mapped[bool] = mapped_column(Boolean, default=False)
    research_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    company: Mapped["Company"] = relationship(back_populates="jobs")
    profile: Mapped[Optional["JobProfile"]] = relationship(back_populates="job", uselist=False)
    competencies: Mapped[list["Competency"]] = relationship(back_populates="job")
    candidates: Mapped[list["Candidate"]] = relationship(back_populates="job")


class JobProfile(Base):
    __tablename__ = "job_profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    required_skills: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    preferred_skills: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    experience: Mapped[str] = mapped_column(Text, default="")
    responsibilities: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    technical_competencies: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    behavioral_competencies: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    raw_extraction: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    job: Mapped["Job"] = relationship(back_populates="profile")


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    email: Mapped[str] = mapped_column(String(320), default="")
    phone: Mapped[str] = mapped_column(String(64), default="")
    raw_resume_text: Mapped[str] = mapped_column(Text, default="")
    consent_given: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    job: Mapped[Optional["Job"]] = relationship(back_populates="candidates")
    profile: Mapped[Optional["CandidateProfile"]] = relationship(back_populates="candidate", uselist=False)


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    candidate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), unique=True)
    candidate_name: Mapped[str] = mapped_column(String(255), default="")
    email: Mapped[str] = mapped_column(String(320), default="")
    phone: Mapped[str] = mapped_column(String(64), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    skills: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    experience: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    education: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    projects: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    certifications: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    achievements: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    source_evidence: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    raw_extraction: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    candidate: Mapped["Candidate"] = relationship(back_populates="profile")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True)
    candidate_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("candidates.id", ondelete="SET NULL"), nullable=True
    )
    document_type: Mapped[str] = mapped_column(String(80), index=True)  # jd, resume, knowledge, guideline
    filename: Mapped[str] = mapped_column(String(512), default="")
    mime_type: Mapped[str] = mapped_column(String(120), default="")
    storage_path: Mapped[str] = mapped_column(String(1024), default="")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    extracted_text: Mapped[str] = mapped_column(Text, default="")
    meta: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chunks: Mapped[list["DocumentChunk"]] = relationship(back_populates="document")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        Index("ix_chunks_company_job_type", "company_id", "job_id", "document_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True, index=True)
    document_type: Mapped[str] = mapped_column(String(80), default="")
    competency: Mapped[str] = mapped_column(String(120), default="")
    section: Mapped[str] = mapped_column(String(255), default="")
    source: Mapped[str] = mapped_column(String(512), default="")
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = embedding_column(384)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped["Document"] = relationship(back_populates="chunks")


class ResumeJdMatch(Base):
    __tablename__ = "resume_jd_matches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    candidate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    strong_matches: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    partial_matches: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    missing: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    claims_to_validate: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    relevant_projects: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    potential_interview_areas: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Competency(Base):
    __tablename__ = "competencies"
    __table_args__ = (UniqueConstraint("job_id", "name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    weight_pct: Mapped[float] = mapped_column(Float, default=0.0)
    rubric: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    job: Mapped["Job"] = relationship(back_populates="competencies")


class QuestionBankItem(Base):
    __tablename__ = "question_bank"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), nullable=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    competency: Mapped[str] = mapped_column(String(120), default="")
    difficulty: Mapped[str] = mapped_column(String(40), default="medium")
    expected_concepts: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    rubric: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    mandatory: Mapped[bool] = mapped_column(Boolean, default=False)
    time_limit_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    question_type: Mapped[str] = mapped_column(String(40), default="technical")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CompanyKnowledge(Base):
    __tablename__ = "company_knowledge"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True)
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(255), default="")
    knowledge_type: Mapped[str] = mapped_column(String(80), default="general")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InterviewSession(Base):
    __tablename__ = "interview_sessions"
    __table_args__ = (Index("ix_interview_token_hash", "token_hash"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    candidate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    status: Mapped[InterviewStatus] = mapped_column(Enum(InterviewStatus), default=InterviewStatus.draft)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    plan: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    state: Mapped[Optional["InterviewStateRow"]] = relationship(back_populates="session", uselist=False)
    questions: Mapped[list["InterviewQuestion"]] = relationship(back_populates="session")
    report: Mapped[Optional["InterviewReport"]] = relationship(back_populates="session", uselist=False)


class InterviewStateRow(Base):
    __tablename__ = "interview_states"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), unique=True
    )
    state: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    session: Mapped["InterviewSession"] = relationship(back_populates="state")


class InterviewQuestion(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True
    )
    competency: Mapped[str] = mapped_column(String(120), default="")
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(40), default="medium")
    source: Mapped[str] = mapped_column(String(80), default="generated")  # generated, mandatory, rag
    expected_concepts: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    asked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    meta: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)

    session: Mapped["InterviewSession"] = relationship(back_populates="questions")
    answers: Mapped[list["Answer"]] = relationship(back_populates="question")


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True
    )
    answer_text: Mapped[str] = mapped_column(Text, default="")
    audio_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    question: Mapped["InterviewQuestion"] = relationship(back_populates="answers")
    evaluation: Mapped[Optional["AnswerEvaluation"]] = relationship(back_populates="answer", uselist=False)


class AnswerEvaluation(Base):
    __tablename__ = "answer_evaluations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    answer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("answers.id", ondelete="CASCADE"), unique=True)
    competencies: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    correctness: Mapped[int] = mapped_column(Integer, default=0)
    depth: Mapped[int] = mapped_column(Integer, default=0)
    reasoning: Mapped[int] = mapped_column(Integer, default=0)
    clarity: Mapped[int] = mapped_column(Integer, default=0)
    evidence: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    missing_points: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(40), default="scored")
    raw: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    answer: Mapped["Answer"] = relationship(back_populates="evaluation")


class CompetencyScore(Base):
    __tablename__ = "competency_scores"
    __table_args__ = (UniqueConstraint("session_id", "competency"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True
    )
    competency: Mapped[str] = mapped_column(String(120), nullable=False)
    score_0_to_100: Mapped[float] = mapped_column(Float, default=0.0)
    evidence: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    status: Mapped[str] = mapped_column(String(40), default="scored")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InterviewReport(Base):
    __tablename__ = "interview_reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), unique=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    overall_score: Mapped[float] = mapped_column(Float, default=0.0)
    recommendation: Mapped[Recommendation] = mapped_column(
        Enum(Recommendation), default=Recommendation.insufficient_evidence
    )
    strengths: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    weaknesses: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    evidence: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    resume_validation: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    technical_gaps: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    behavioral_observations: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    recommended_next_step: Mapped[str] = mapped_column(Text, default="")
    candidate_facing: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    full_report: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    human_override: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    recruiter_notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    session: Mapped["InterviewSession"] = relationship(back_populates="report")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), default="")
    resource_id: Mapped[str] = mapped_column(String(80), default="")
    details: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ResearchSource(Base):
    __tablename__ = "research_sources"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(1024), default="")
    meta: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PromptVersion(Base):
    __tablename__ = "prompt_versions"
    __table_args__ = (UniqueConstraint("name", "version"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LLMTrace(Base):
    __tablename__ = "llm_traces"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True, index=True)
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True, index=True)
    prompt_name: Mapped[str] = mapped_column(String(120), default="")
    prompt_version: Mapped[str] = mapped_column(String(40), default="")
    model: Mapped[str] = mapped_column(String(120), default="")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CreditWallet(Base):
    __tablename__ = "credit_wallets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), unique=True, index=True
    )
    balance: Mapped[int] = mapped_column(Integer, default=100)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CreditLedger(Base):
    __tablename__ = "credit_ledger"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(120), default="topup")
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
