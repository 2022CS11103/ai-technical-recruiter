"""Seed demo recruiter, sample job, candidate, knowledge, questions."""
import asyncio
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, engine
from app.models import (
    Base,
    Candidate,
    CandidateProfile,
    Company,
    CompanyMembership,
    Competency,
    Job,
    JobProfile,
    QuestionBankItem,
    User,
    UserRole,
)
from sqlalchemy import text


async def seed() -> None:
    settings = get_settings()
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception:
            pass
        await conn.run_sync(Base.metadata.create_all)

    sample_dir = Path(__file__).resolve().parents[4] / "sample_data"
    jd = (sample_dir / "ai_engineer_jd.md").read_text(encoding="utf-8") if (sample_dir / "ai_engineer_jd.md").exists() else "AI Engineer JD"
    resume = (sample_dir / "alex_rivera_resume.md").read_text(encoding="utf-8") if (sample_dir / "alex_rivera_resume.md").exists() else "Alex Rivera resume"

    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(User).where(User.email == settings.demo_email))).scalar_one_or_none()
        if existing:
            print("Demo user already exists")
            return
        company = Company(name="Nimbus Recruiting", slug="nimbus-demo")
        user = User(
            email=settings.demo_email,
            hashed_password=hash_password(settings.demo_password),
            full_name=settings.demo_name,
            role=UserRole.recruiter,
        )
        db.add(company)
        db.add(user)
        await db.flush()
        db.add(CompanyMembership(company_id=company.id, user_id=user.id, role=UserRole.recruiter))
        job = Job(
            company_id=company.id,
            title="AI Engineer",
            raw_jd_text=jd,
            interview_duration_minutes=30,
            difficulty="adaptive",
            interview_style="ai_engineer",
            created_by=user.id,
        )
        db.add(job)
        await db.flush()
        db.add(
            JobProfile(
                job_id=job.id,
                title="AI Engineer",
                required_skills=["Python", "FastAPI", "LLMs", "RAG", "PostgreSQL"],
                preferred_skills=["Kubernetes", "Kafka", "LangGraph"],
                experience="3+ years",
                responsibilities=["Build LLM features", "Own RAG quality", "Ship reliable APIs"],
                technical_competencies=["Python", "Backend", "LLMs", "RAG", "System Design"],
                behavioral_competencies=["Communication"],
            )
        )
        weights = [
            ("Python", 15),
            ("Backend", 15),
            ("LLMs", 20),
            ("RAG", 20),
            ("System Design", 20),
            ("Communication", 10),
        ]
        for name, w in weights:
            db.add(Competency(job_id=job.id, name=name, weight_pct=w))
        cand = Candidate(
            company_id=company.id,
            job_id=job.id,
            full_name="Alex Rivera",
            email="alex.rivera@example.com",
            raw_resume_text=resume,
            consent_given=True,
        )
        db.add(cand)
        await db.flush()
        db.add(
            CandidateProfile(
                candidate_id=cand.id,
                candidate_name="Alex Rivera",
                email="alex.rivera@example.com",
                summary="AI engineer with production LLM and RAG experience.",
                skills=["Python", "FastAPI", "LLMs", "RAG", "PostgreSQL", "Docker"],
                experience=[{"title": "AI Engineer", "company": "Nimbus Labs", "bullets": ["Built CreatorOS using Python, LLMs and RAG."]}],
                projects=[{"name": "CreatorOS", "description": "Production RAG assistant for creators."}],
                education=[{"degree": "B.S. Computer Science", "school": "State University"}],
            )
        )
        db.add(
            QuestionBankItem(
                company_id=company.id,
                job_id=job.id,
                question="How would you design a production RAG system?",
                competency="RAG",
                difficulty="hard",
                expected_concepts=["chunking", "embeddings", "retrieval", "reranking", "evaluation"],
                mandatory=False,
            )
        )
        await db.commit()
        print(f"Seeded demo user {settings.demo_email} / {settings.demo_password}")
        print(f"Job={job.id} Candidate={cand.id}")


if __name__ == "__main__":
    asyncio.run(seed())
