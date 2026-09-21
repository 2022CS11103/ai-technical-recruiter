"""JD skills → interview competencies + claim-specific probe ladders.

Code owns this map so free/cheap models still get structured interviews.
"""
from __future__ import annotations

from typing import Any

# Skill / topic → facets the interviewer should probe.
SKILL_FACETS: dict[str, list[str]] = {
    "python": ["async", "APIs", "debugging", "architecture", "packaging"],
    "fastapi": ["routing", "dependency injection", "validation", "async handlers", "middleware"],
    "llms": ["prompting", "tool use", "latency", "evaluation", "failure modes"],
    "rag": ["chunking", "embeddings", "retrieval", "reranking", "evaluation", "scaling"],
    "postgresql": ["schema design", "indexing", "transactions", "query plans", "migrations"],
    "system design": ["APIs", "data model", "consistency", "failure handling", "scaling"],
    "docker": ["images", "networking", "volumes", "multi-stage builds", "runtime limits"],
    "kubernetes": ["deployments", "services", "probes", "autoscaling", "debugging"],
    "kafka": ["producers", "consumers", "partitioning", "offsets", "failure handling"],
    "react": ["state", "hooks", "rendering", "data fetching", "performance"],
    "typescript": ["types", "generics", "async", "tooling", "API contracts"],
    "aws": ["IAM", "networking", "compute", "storage", "observability"],
    "pytorch": ["training loop", "data pipeline", "GPU memory", "evaluation", "serving"],
    "tensorflow": ["graphs", "training", "serving", "evaluation", "performance"],
    "redis": ["caching", "TTL", "data structures", "persistence", "failure modes"],
    "sql": ["joins", "indexing", "transactions", "window functions", "query plans"],
    "backend": ["APIs", "auth", "data layer", "reliability", "observability"],
    "machine learning": ["features", "training", "evaluation", "drift", "serving"],
    "computer vision": ["pipeline", "models", "augmentation", "metrics", "latency"],
}


def normalize_skill(name: str) -> str:
    return " ".join((name or "").lower().split())


def facets_for(skill: str) -> list[str]:
    key = normalize_skill(skill)
    if key in SKILL_FACETS:
        return list(SKILL_FACETS[key])
    for known, facets in SKILL_FACETS.items():
        if known in key or key in known:
            return list(facets)
    return ["architecture", "ownership", "trade-offs", "failure handling"]


def detect_claim_domain(claim: str) -> str:
    text = (claim or "").lower()
    for skill in (
        "rag",
        "llm",
        "fastapi",
        "kubernetes",
        "kafka",
        "postgresql",
        "docker",
        "pytorch",
        "react",
        "typescript",
        "redis",
        "aws",
        "computer vision",
        "machine learning",
        "python",
        "system design",
    ):
        if skill in text or skill.replace(" ", "") in text.replace(" ", ""):
            return skill if skill != "llm" else "llms"
    return ""


def claim_probe_ladder(claim: str, competency: str, project: str = "") -> list[str]:
    """Progressive probes grounded in a resume claim — never generic trivia."""
    domain = detect_claim_domain(claim) or normalize_skill(competency)
    project_name = " ".join(str(project or "").split()).strip(" -:•|,.")
    pl = project_name.lower()
    if (
        not project_name
        or len(project_name.split()) > 6
        or len(project_name) > 48
        or pl.startswith(("and ", "or ", "to ", "for ", "with ", "in ", "on ", "the ", "integrated "))
        or pl in {"built", "designed", "created", "developed", "project"}
    ):
        project_name = ""
    project_bit = f" in {project_name}" if project_name else ""
    claim_snip = " ".join((claim or "").split())[:90]
    if claim_snip.lower().startswith(("and ", "or ", "to ", "for ", "with ", "integrated ")):
        claim_snip = competency or "this work"

    if domain == "rag":
        return [
            f"You wrote about “{claim_snip}”. Walk me through the RAG architecture{project_bit} — ingestion, retrieval, and response.",
            f"How did you chunk documents and choose embeddings{project_bit}, and what trade-offs did you make?",
            f"When retrieval returned irrelevant results{project_bit}, how did you detect and fix that?",
            f"How did you evaluate RAG quality{project_bit} — what metrics or failure cases did you track?",
        ]
    if domain in {"llms", "llm"}:
        return [
            f"You mentioned “{claim_snip}”. How did you structure prompts and tool calls{project_bit}?",
            f"What controlled latency and cost for the model{project_bit}?",
            f"How did you evaluate answer quality{project_bit} beyond vibes?",
            f"Tell me about one model failure{project_bit} and how you mitigated it.",
        ]
    if domain == "python":
        return [
            f"Walk me through how you used Python{project_bit} — the main modules and what you personally owned.",
            f"Where did async or concurrency matter{project_bit}, and how did you debug issues?",
            f"How did you structure APIs or interfaces{project_bit}, and why that shape?",
            f"Describe one production bug in Python{project_bit} and how you found the root cause.",
        ]
    if domain == "fastapi":
        return [
            f"Walk me through the FastAPI service{project_bit} — routes, deps, and validation.",
            f"How did you handle auth and errors{project_bit}?",
            f"What async patterns did you use{project_bit}, and what broke under load?",
            f"How did you test and observe the API{project_bit} in production?",
        ]
    if domain == "system design":
        return [
            f"Design the core flow for “{claim_snip or competency}”{project_bit} — APIs, data, and failure paths.",
            f"Where are the consistency and scaling bottlenecks{project_bit}?",
            f"What would you change if traffic jumped 10x{project_bit}?",
            f"Tell me about one outage-style failure{project_bit} and your recovery plan.",
        ]

    facets = facets_for(domain or competency)
    topic = project or competency or "this work"
    return [
        f"You wrote “{claim_snip}”. Walk me through {topic} — architecture and what you owned.",
        f"For {topic}, how did you handle {facets[0]} and {facets[1] if len(facets) > 1 else 'ownership'}?",
        f"Why that approach for {facets[2] if len(facets) > 2 else 'trade-offs'} instead of a simpler one?",
        f"What broke around {facets[-1]} and how did you find and fix it?",
    ]


def expand_jd_to_competencies(
    required: list[str],
    preferred: list[str],
    responsibilities: list[str],
    seniority: str = "",
) -> list[dict[str, Any]]:
    """Turn JD skills into weighted interview competencies with facets."""
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for skill in list(required) + list(preferred)[:3]:
        name = (skill or "").strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        must = name in required
        items.append(
            {
                "name": name,
                "must_have": must,
                "nice_to_have": not must,
                "facets": facets_for(name),
                "seniority_signal": seniority or "",
                "why": "Must-have on JD" if must else "Nice-to-have on JD",
            }
        )
    # Fold responsibility keywords that look technical
    for resp in responsibilities[:6]:
        text = str(resp or "").strip()
        if len(text) < 12:
            continue
        for skill in list(SKILL_FACETS):
            if skill in text.lower() and skill not in seen:
                seen.add(skill)
                items.append(
                    {
                        "name": skill.title() if len(skill) < 4 else skill,
                        "must_have": True,
                        "nice_to_have": False,
                        "facets": facets_for(skill),
                        "seniority_signal": seniority or "",
                        "why": f"Implied by responsibility: {text[:80]}",
                    }
                )
                break
    return items[:8]
