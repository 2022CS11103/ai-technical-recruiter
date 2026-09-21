from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "recruiter"


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: str
    company_id: Optional[UUID] = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    company_name: str = "My Company"
    role: str = "recruiter"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class JobCreate(BaseModel):
    title: str
    raw_jd_text: str = ""
    interview_duration_minutes: int = 30
    difficulty: str = "adaptive"
    interview_style: str = "technical"
    competencies: list[dict[str, Any]] = Field(default_factory=list)
    allow_pause: bool = True
    show_candidate_feedback: bool = False


class JobUpdate(BaseModel):
    title: Optional[str] = None
    raw_jd_text: Optional[str] = None
    interview_duration_minutes: Optional[int] = None
    difficulty: Optional[str] = None
    interview_style: Optional[str] = None
    competencies: Optional[list[dict[str, Any]]] = None
    status: Optional[str] = None
    allow_pause: Optional[bool] = None
    show_candidate_feedback: Optional[bool] = None


class JobOut(BaseModel):
    id: UUID
    title: str
    status: str
    interview_duration_minutes: int
    difficulty: str
    interview_style: str
    raw_jd_text: str
    profile: Optional[dict[str, Any]] = None
    competencies: list[dict[str, Any]] = Field(default_factory=list)


class CandidateCreate(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    raw_resume_text: str = ""


class CandidateOut(BaseModel):
    id: UUID
    full_name: str
    email: str
    phone: str
    job_id: Optional[UUID] = None
    profile: Optional[dict[str, Any]] = None


class MatchOut(BaseModel):
    strong_matches: list[str]
    partial_matches: list[str]
    missing: list[str]
    claims_to_validate: list[str]
    relevant_projects: list[str] = Field(default_factory=list)
    potential_interview_areas: list[str] = Field(default_factory=list)


class QuestionCreate(BaseModel):
    question: str
    competency: str = ""
    difficulty: str = "medium"
    expected_concepts: list[str] = Field(default_factory=list)
    rubric: dict[str, Any] = Field(default_factory=dict)
    mandatory: bool = False
    time_limit_seconds: Optional[int] = None
    question_type: str = "technical"
    job_id: Optional[UUID] = None


class InterviewCreate(BaseModel):
    job_id: UUID
    candidate_id: UUID
    duration_minutes: Optional[int] = None


class InterviewOut(BaseModel):
    id: UUID
    status: str
    job_id: UUID
    candidate_id: UUID
    duration_minutes: int
    interview_url_token: Optional[str] = None
    plan: dict[str, Any] = Field(default_factory=dict)


class AnswerIn(BaseModel):
    answer_text: str


class ReportOverride(BaseModel):
    human_override: str
    recruiter_notes: str = ""


class OverviewStats(BaseModel):
    active_jobs: int
    upcoming_interviews: int
    completed_interviews: int
    candidates: int
    average_score: float
    interviews_needing_review: int


class ConsentIn(BaseModel):
    consent: bool = True
