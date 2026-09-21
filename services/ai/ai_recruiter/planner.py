"""JD + resume → structured interview plan. Application owns the plan; LLM may enrich it."""
from __future__ import annotations

import re
from typing import Any

from ai_recruiter.competency_map import claim_probe_ladder, expand_jd_to_competencies, facets_for
from ai_recruiter.prompts.registry import get_prompt
from ai_recruiter.providers.llm import LLMProvider
from ai_recruiter.schemas import InterviewPlan


def _as_list(value: Any) -> list[str]:
    if isinstance(value, str):
        item = value.strip()
        return [item] if item else []
    out: list[str] = []
    for item in value or []:
        if isinstance(item, dict):
            name = item.get("name") or item.get("title") or item.get("claim")
            if name:
                out.append(str(name).strip())
        elif item:
            out.append(str(item).strip())
    return [x for x in out if x]


_JUNK_TOPICS = {
    "built",
    "designed",
    "created",
    "developed",
    "project",
    "projects",
    "resume",
    "experience",
    "internship",
    "intern",
    "responsible",
    "worked",
}


def clean_topic_name(raw: str) -> str:
    text = " ".join(str(raw or "").split()).strip(" -:•|,.")
    lowered = text.lower()
    for prefix in (
        "built:",
        "built ",
        "created:",
        "created ",
        "developed:",
        "developed ",
        "designed:",
        "designed ",
        "project:",
        "projects:",
        "worked on ",
        "and ",
        "or ",
        "with ",
        "using ",
    ):
        if lowered.startswith(prefix):
            text = text[len(prefix) :].strip(" -:•|,.")
            lowered = text.lower()
            break
    if not text or lowered in _JUNK_TOPICS or len(text) < 4:
        return ""
    # Reject claim fragments used as project titles
    if lowered.startswith(("and ", "or ", "to ", "for ", "with ", "in ", "on ", "the ")):
        return ""
    if "@" in text or text[:1].isdigit() and len(text) < 8:
        return ""
    # Prefer short title-like names; long sentence fragments are claims, not projects
    if len(text.split()) > 6 or len(text) > 48:
        # Keep only if it looks like a product name (TitleCase / CamelCase token)
        tokens = re.findall(r"[A-Z][A-Za-z0-9]{2,}", text)
        if tokens:
            text = tokens[0]
        else:
            return ""
    return text


def _unique(items: list[str], limit: int = 6) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        key = item.lower()
        if key in seen or len(item) < 2:
            continue
        seen.add(key)
        result.append(item)
        if len(result) >= limit:
            break
    return result


def _probe_ladder(competency: str, claim: str, project: str) -> list[str]:
    if claim:
        return claim_probe_ladder(claim, competency, project)
    topic = competency or "this work"
    project_name = clean_topic_name(project)
    if project_name:
        topic = f"{competency} in {project_name}" if competency else project_name
    facets = facets_for(competency)
    return [
        f"Walk me through how you used {topic} — the main parts, and what you personally owned.",
        f"What was the core piece around {facets[0] if facets else 'this setup'} actually responsible for?",
        f"Why did you choose that approach for {facets[1] if len(facets) > 1 else competency or 'this'} instead of a simpler one?",
        f"Tell me about one thing that broke around {facets[-1] if facets else 'production'}, and how you found and fixed it.",
    ]


def _structured_candidate_profile(context: dict[str, Any]) -> dict[str, Any]:
    """Compact profile for turns — not the raw resume dump."""
    existing = context.get("candidate_profile")
    if isinstance(existing, dict) and (existing.get("projects") or existing.get("skills")):
        return existing
    match = context.get("match") or {}
    projects = []
    for p in context.get("resume_projects") or []:
        if isinstance(p, dict):
            name = clean_topic_name(str(p.get("name") or p.get("title") or ""))
            if name:
                projects.append(
                    {
                        "name": name,
                        "description": str(p.get("description") or "")[:240],
                        "tech": p.get("tech") or p.get("technologies") or [],
                    }
                )
        elif p:
            name = clean_topic_name(str(p))
            if name:
                projects.append({"name": name, "description": "", "tech": []})
    for p in match.get("relevant_projects") or []:
        name = clean_topic_name(str(p))
        if name and name.lower() not in {x["name"].lower() for x in projects}:
            projects.append({"name": name, "description": "", "tech": []})
    return {
        "name": context.get("candidate_name") or "",
        "skills": _as_list(context.get("resume_skills"))[:16],
        "technologies": _as_list(context.get("resume_technologies") or context.get("resume_skills"))[:16],
        "projects": projects[:6],
        "experience": (context.get("resume_experience") or [])[:4],
        "claims": _as_list(match.get("claims_to_validate") or context.get("resume_claims"))[:8],
        "metrics": _as_list(context.get("resume_metrics"))[:6],
        "summary": str(context.get("resume_summary") or "")[:400],
    }


def heuristic_plan(context: dict[str, Any]) -> InterviewPlan:
    match = context.get("match") or {}
    jd_skills = _as_list(context.get("jd_required_skills"))
    preferred = _as_list(context.get("jd_preferred_skills"))
    responsibilities = _as_list(context.get("jd_responsibilities"))
    tech = (
        _as_list((context.get("competencies") or {}).keys())
        if isinstance(context.get("competencies"), dict)
        else []
    )
    resume_skills = _as_list(context.get("resume_skills"))
    projects = [
        p
        for x in (_as_list(context.get("resume_projects")) or _as_list(match.get("relevant_projects")))
        if (p := clean_topic_name(x))
    ]
    claims = _as_list(match.get("claims_to_validate") or context.get("resume_claims"))
    suspicious = _as_list(match.get("suspicious_claims"))
    gaps = _as_list(match.get("missing"))
    strong = _as_list(match.get("strong_matches"))
    seniority = str(context.get("seniority") or context.get("jd_experience") or "")

    jd_comps = expand_jd_to_competencies(jd_skills or tech, preferred, responsibilities, seniority)
    names = _unique(
        [c["name"] for c in jd_comps] + strong + resume_skills[:2],
        limit=5,
    )
    if not names:
        names = ["Technical depth", "System design", "Communication"]

    weight = round(100 / len(names), 1)
    profile = _structured_candidate_profile(context)
    competencies: list[dict[str, Any]] = []
    for i, name in enumerate(names):
        claim = claims[i] if i < len(claims) else (projects[i] if i < len(projects) else "")
        if name in [s.lower() for s in suspicious] or any(name.lower() in c.lower() for c in suspicious):
            claim = next((c for c in suspicious if name.lower() in c.lower()), claim)
        project = projects[i % len(projects)] if projects else ""
        why = "Required on the JD" if name in jd_skills or name in tech else "Claimed on the resume"
        if any(name.lower() == g.lower() for g in gaps):
            why = "JD requires this; resume is weaker — verify real exposure"
        elif any(name.lower() in c.lower() for c in suspicious):
            why = "Suspicious/unclear claim — demand concrete evidence"
        elif any(name.lower() == s.lower() for s in strong):
            why = "Strong resume match — go deep, not generic"
        facets = facets_for(name)
        competencies.append(
            {
                "name": name,
                "weight": weight if i < len(names) - 1 else round(100 - weight * (len(names) - 1), 1),
                "why": why,
                "claim": claim,
                "project": project,
                "facets": facets,
                "must_have": name in jd_skills or any(c.get("name") == name and c.get("must_have") for c in jd_comps),
                "probe_levels": _probe_ladder(name, claim, project),
                "min_evidence": 2,
            }
        )

    # Prefer verifying strong/suspicious claims early
    order_keys = {n.lower(): i for i, n in enumerate(names)}
    competencies.sort(
        key=lambda c: (
            0 if any(str(c.get("name") or "").lower() in s.lower() for s in suspicious) else 1,
            0 if c.get("must_have") else 1,
            order_keys.get(str(c.get("name") or "").lower(), 99),
        )
    )

    coverage = {c["name"]: c["weight"] for c in competencies}
    return InterviewPlan(
        duration_minutes=int(context.get("duration_minutes") or 30),
        sections=["introduction", "resume", "technical", "behavioral", "candidate_questions"],
        competency_coverage=coverage,
        question_budget=max(8, len(competencies) * 2),
        difficulty_strategy=str(context.get("difficulty") or "adaptive"),
        mandatory_questions=[],
        resume_claims_to_validate=claims,
        competencies=competencies,
        claims=claims,
        gaps=gaps,
        projects=projects[:4],
        suspicious_claims=suspicious,
        seniority=seniority,
        candidate_profile=profile,
    )


async def build_interview_plan(llm: LLMProvider | None, context: dict[str, Any]) -> InterviewPlan:
    base = heuristic_plan(context)
    if llm is None:
        return base
    system, version = get_prompt("interview_planner")
    try:
        enriched = await llm.structured_output(
            [
                {
                    "role": "system",
                    "content": system
                    + " Keep competencies to 4-6. Each competency needs why, claim, project, facets, "
                    "and 4 probe_levels grounded in resume claims (never generic trivia). JSON only.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Seed plan:\n{base.model_dump_json()}\n"
                        f"Job: {context.get('job_title')}\n"
                        f"Seniority: {context.get('seniority') or context.get('jd_experience')}\n"
                        f"Match: {context.get('match')}\n"
                        f"Candidate profile: {base.candidate_profile}\n"
                        f"JD responsibilities: {context.get('jd_responsibilities')}"
                    ),
                },
            ],
            InterviewPlan,
            meta={"prompt_name": "interview_planner", "prompt_version": version},
        )
        if not enriched.competencies:
            enriched.competencies = base.competencies
        for item in enriched.competencies:
            if isinstance(item, dict):
                claim = str(item.get("claim") or "")
                project = clean_topic_name(str(item.get("project") or "")) or ""
                name = str(item.get("name") or "this work")
                if not item.get("probe_levels"):
                    item["probe_levels"] = _probe_ladder(name, claim, project)
                if not item.get("facets"):
                    item["facets"] = facets_for(name)
                item["min_evidence"] = int(item.get("min_evidence") or 2)
        if not enriched.competency_coverage:
            enriched.competency_coverage = base.competency_coverage
        if not enriched.resume_claims_to_validate:
            enriched.resume_claims_to_validate = base.resume_claims_to_validate
        if not enriched.claims:
            enriched.claims = base.claims
        if not enriched.gaps:
            enriched.gaps = base.gaps
        if not enriched.suspicious_claims:
            enriched.suspicious_claims = base.suspicious_claims
        if not enriched.candidate_profile:
            enriched.candidate_profile = base.candidate_profile
        if not enriched.projects:
            enriched.projects = base.projects
        return enriched
    except Exception:
        return base
