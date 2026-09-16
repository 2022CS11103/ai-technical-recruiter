"""Heuristic + LLM resume/JD parsing and matching."""
from __future__ import annotations

import re
from typing import Any

from ai_recruiter.prompts.registry import get_prompt
from ai_recruiter.providers.llm import LLMProvider, MockLLM
from ai_recruiter.schemas import JobProfileExtract, MatchResult, ResumeProfile


async def parse_resume(llm: LLMProvider, text: str) -> ResumeProfile:
    """Parse resume. Always ground identity (name/email) in the actual pasted text."""
    heuristic = _heuristic_resume(text)

    # Without a real LLM key, never invent a canned "Alex Rivera" profile.
    if isinstance(llm, MockLLM):
        return heuristic

    system, version = get_prompt("resume_parser")
    try:
        parsed = await llm.structured_output(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": f"Parse the following resume:\n\n{text[:12000]}"},
            ],
            ResumeProfile,
            meta={"prompt_name": "resume_parser", "prompt_version": version},
        )
    except Exception:
        return heuristic

    return _merge_resume_with_text(parsed, heuristic, text)


def _merge_resume_with_text(parsed: ResumeProfile, heuristic: ResumeProfile, text: str) -> ResumeProfile:
    """Prefer text-grounded name/email when the model invents a name not present in the resume."""
    data = parsed.model_dump()
    text_l = text.lower()

    llm_name = (parsed.candidate_name or "").strip()
    heur_name = (heuristic.candidate_name or "").strip()
    if not llm_name or (llm_name.lower() not in text_l and heur_name and heur_name.lower() in text_l):
        data["candidate_name"] = heur_name or llm_name or "Candidate"
    if heuristic.email and (not parsed.email or parsed.email.lower() not in text_l):
        data["email"] = heuristic.email
    if heuristic.phone and not parsed.phone:
        data["phone"] = heuristic.phone
    if not parsed.skills and heuristic.skills:
        data["skills"] = heuristic.skills
    if not parsed.projects and heuristic.projects:
        data["projects"] = heuristic.projects
    if not parsed.summary and heuristic.summary:
        data["summary"] = heuristic.summary
    data["source_evidence"] = {
        **(parsed.source_evidence or {}),
        "name_source": "resume_text",
        "raw_excerpt": text[:800],
    }
    return ResumeProfile.model_validate(data)


async def analyze_jd(llm: LLMProvider, text: str) -> JobProfileExtract:
    if isinstance(llm, MockLLM):
        return _heuristic_jd(text)
    system, version = get_prompt("jd_analyzer")
    try:
        return await llm.structured_output(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": f"Analyze this job description:\n\n{text[:12000]}"},
            ],
            JobProfileExtract,
            meta={"prompt_name": "jd_analyzer", "prompt_version": version},
        )
    except Exception:
        return _heuristic_jd(text)


async def match_resume_jd(
    llm: LLMProvider, resume: ResumeProfile, job: JobProfileExtract
) -> MatchResult:
    if isinstance(llm, MockLLM):
        return _heuristic_match(resume, job)
    system, version = get_prompt("candidate_jd_matcher")
    try:
        return await llm.structured_output(
            [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": (
                        f"Resume profile:\n{resume.model_dump_json()}\n\n"
                        f"Job profile:\n{job.model_dump_json()}"
                    ),
                },
            ],
            MatchResult,
            meta={"prompt_name": "candidate_jd_matcher", "prompt_version": version},
        )
    except Exception:
        return _heuristic_match(resume, job)


def _extract_person_name(text: str) -> str:
    lines = [ln.strip(" #-*\t") for ln in text.splitlines() if ln.strip()]
    skip = re.compile(
        r"^(resume|curriculum vitae|cv|profile|summary|experience|education|skills|"
        r"projects|contact|objective|about me|phone|email|linkedin|github)\b",
        re.I,
    )
    for ln in lines[:12]:
        if skip.search(ln):
            continue
        if "@" in ln or re.search(r"https?://|www\.", ln, re.I):
            continue
        if re.search(r"\d{3,}", ln) and not re.search(r"[A-Za-z]{2,}", ln):
            continue
        words = re.findall(r"[A-Za-z][A-Za-z'.-]*", ln)
        if 1 <= len(words) <= 5 and len(ln) <= 60:
            if sum(1 for w in words if w[0].isupper()) >= 1:
                return " ".join(words)[:120]
    return lines[0][:120] if lines else "Candidate"


def _heuristic_resume(text: str) -> ResumeProfile:
    email_m = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    phone_m = re.search(r"\+?\d[\d\s().-]{7,}\d", text)
    skills_known = [
        "Python",
        "FastAPI",
        "LLMs",
        "RAG",
        "PostgreSQL",
        "Docker",
        "Kubernetes",
        "Kafka",
        "React",
        "TypeScript",
        "LangGraph",
        "Redis",
        "Java",
        "SQL",
        "AWS",
        "Azure",
        "GCP",
        "PyTorch",
        "TensorFlow",
        "Next.js",
        "Node.js",
    ]
    skills = [s for s in skills_known if re.search(rf"\b{re.escape(s)}\b", text, re.I)]
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    name = _extract_person_name(text)
    claims = []
    for ln in lines:
        if re.search(r"\b(built|designed|led|implemented|production|developed|created)\b", ln, re.I):
            claims.append(ln[:200])
    projects = []
    for c in claims[:5]:
        proj = re.search(r"\b([A-Z][A-Za-z0-9]+(?:OS|App|System|Platform|AI)?)\b", c)
        projects.append({"name": proj.group(1) if proj else c[:40], "description": c})
    return ResumeProfile(
        candidate_name=name,
        email=email_m.group(0) if email_m else "",
        phone=phone_m.group(0) if phone_m else "",
        summary=" ".join(lines[1:5])[:500],
        skills=skills,
        experience=[{"title": "Experience", "bullets": claims[:5]}],
        projects=projects,
        achievements=claims[:3],
        source_evidence={"raw_excerpt": text[:800], "name_source": "heuristic"},
    )


def _heuristic_jd(text: str) -> JobProfileExtract:
    skills_known = [
        "Python",
        "FastAPI",
        "LLMs",
        "RAG",
        "PostgreSQL",
        "Docker",
        "Kubernetes",
        "Kafka",
        "LangGraph",
        "System Design",
    ]
    required = [s for s in skills_known if re.search(rf"\b{re.escape(s)}\b", text, re.I)]
    title_m = re.search(r"(?im)^(?:job\s*title|role)\s*[:\-]\s*(.+)$", text)
    title = title_m.group(1).strip() if title_m else "Technical Role"
    if re.search(r"\bAI Engineer\b", text, re.I):
        title = "AI Engineer"
    elif re.search(r"\bBackend Engineer\b", text, re.I):
        title = "Backend Engineer"
    return JobProfileExtract(
        title=title,
        required_skills=required or ["Python"],
        preferred_skills=[s for s in ["Kubernetes", "Kafka"] if s.lower() in text.lower()],
        experience="See JD",
        responsibilities=[ln.strip("-• ") for ln in text.splitlines() if ln.strip().startswith(("-", "•"))][:8],
        technical_competencies=required,
        behavioral_competencies=["Communication"],
    )


def _heuristic_match(resume: ResumeProfile, job: JobProfileExtract) -> MatchResult:
    rskills = {s.lower(): s for s in resume.skills}
    strong, partial, missing = [], [], []
    for skill in job.required_skills:
        key = skill.lower()
        if key in rskills:
            strong.append(skill)
        elif any(key in rs or rs in key for rs in rskills):
            partial.append(skill)
        else:
            missing.append(skill)
    for skill in job.preferred_skills:
        key = skill.lower()
        if key in rskills and skill not in strong:
            partial.append(skill)
        elif key not in rskills and skill not in missing:
            missing.append(skill)
    claims = []
    for exp in resume.experience:
        for b in exp.get("bullets", []) if isinstance(exp, dict) else []:
            claims.append(b)
    for p in resume.projects:
        if isinstance(p, dict) and p.get("description"):
            claims.append(str(p["description"]))
    return MatchResult(
        strong_matches=strong,
        partial_matches=partial,
        missing=missing,
        claims_to_validate=claims[:5],
        relevant_projects=[str(p.get("name", p)) for p in resume.projects[:5] if isinstance(p, dict)],
        potential_interview_areas=(missing + strong)[:8],
    )
