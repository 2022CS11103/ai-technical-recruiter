"""Answer evaluation is separate from question generation. Next action is owned by code."""
from __future__ import annotations

import re
from typing import Any

from ai_recruiter.competency_map import facets_for
from ai_recruiter.planner import clean_topic_name
from ai_recruiter.prompts.registry import get_prompt
from ai_recruiter.providers.llm import LLMProvider
from ai_recruiter.schemas import EvaluationResult, GeneratedQuestion, InterviewState, ReportDraft

_JUNK_PROJECT = r"(?:Built|Designed|Created|Developed|Project|Projects)"
_BAD_ON_PROJECT = re.compile(rf"\s+(?:on|in)\s+{_JUNK_PROJECT}\b", re.IGNORECASE)
_BAD_WALKTHROUGH = re.compile(rf"walk me through {_JUNK_PROJECT}\b[:\s]*", re.IGNORECASE)

MAX_PROBE_LEVEL = 4
MIN_EVIDENCE_FOR_SCORE = 2

# Concept cues used for evidence-based heuristic scoring (not "confidence").
_CONCEPT_CUES: dict[str, list[str]] = {
    "rag": ["chunk", "embed", "retriev", "vector", "rerank", "index", "pgvector", "faiss", "similarity"],
    "llms": ["prompt", "token", "latency", "tool", "temperature", "hallucin", "eval"],
    "python": ["async", "await", "fastapi", "pydantic", "decorator", "gil", "package"],
    "fastapi": ["router", "dependenc", "middleware", "uvicorn", "pydantic", "openapi"],
    "system design": ["latency", "throughput", "cache", "shard", "replica", "queue", "failover", "consistency"],
    "postgresql": ["index", "transaction", "vacuum", "join", "explain", "migration"],
    "docker": ["image", "container", "volume", "compose", "layer"],
    "kubernetes": ["pod", "deploy", "service", "probe", "helm", "ingress"],
}


def _sanitize_spoken_question(text: str, competency: str) -> str:
    q = _BAD_WALKTHROUGH.sub("walk me through your project. ", text or "")
    q = _BAD_ON_PROJECT.sub("", q)
    q = re.sub(r"\s{2,}", " ", q).strip(" -:.")
    lowered = q.lower()
    if any(token in lowered for token in (" through built", " through designed", " on built", " on designed")):
        q = ""
    if len(q) < 16:
        topic = clean_topic_name(competency) or competency or "this work"
        return (
            f"Walk me through how you used {topic} — the main parts, "
            "and what you personally owned."
        )
    return q


def topic_key(question: str) -> str:
    """Normalize a question into a dedup key (topic fingerprint)."""
    text = re.sub(r"[^a-z0-9\s]", " ", (question or "").lower())
    stop = {
        "a", "an", "the", "you", "your", "me", "i", "to", "of", "and", "or", "for",
        "how", "what", "why", "when", "where", "did", "do", "does", "can", "could",
        "please", "tell", "walk", "through", "about", "that", "this", "with", "from",
    }
    words = [w for w in text.split() if w not in stop and len(w) > 2]
    return " ".join(words[:8])


def is_topic_covered(question: str, state: InterviewState) -> bool:
    key = topic_key(question)
    if not key:
        return False
    covered = set(state.asked_topic_keys or [])
    if key in covered:
        return True
    key_tokens = set(key.split())
    for prev in covered:
        prev_tokens = set(prev.split())
        overlap = key_tokens & prev_tokens
        if len(overlap) >= 4:
            return True
        union = key_tokens | prev_tokens
        if union and len(overlap) / len(union) >= 0.6:
            return True
    return False


def _concept_hits(answer: str, competency: str, claim: str) -> list[str]:
    text = (answer or "").lower()
    keys = facets_for(competency)
    domain = (competency or "").lower()
    cues = list(_CONCEPT_CUES.get(domain, []))
    for known, words in _CONCEPT_CUES.items():
        if known in (claim or "").lower() or known in domain:
            cues.extend(words)
    hits = []
    for cue in cues + [k.lower() for k in keys]:
        if cue and cue.lower() in text and cue not in hits:
            hits.append(cue)
    return hits[:8]


def heuristic_evaluation(state: InterviewState, answer: str) -> EvaluationResult:
    """Evidence-based heuristic — scores concrete concepts, never 'sounded confident'."""
    competency = state.current_competency or "general"
    words = len(answer.split())
    lower = (answer or "").lower()
    hits = _concept_hits(answer, competency, state.current_claim)

    incorrect_cues = [
        "i don't know",
        "i dont know",
        "not sure",
        "no idea",
        "never used",
        "haven't done",
        "have not done",
    ]
    vague_cues = ["basically", "just used", "stuff", "things", "somehow", "etc"]

    if any(c in lower for c in incorrect_cues) and words < 40:
        quality = "incorrect"
        score = 1
        status = "INSUFFICIENT_EVIDENCE"
    elif words < 16 or (words < 35 and len(hits) == 0):
        quality = "weak"
        score = 2
        status = "INSUFFICIENT_EVIDENCE"
    elif len(hits) >= 3 and words >= 45:
        quality = "strong"
        score = 4 if words < 120 else 5
        status = "scored"
    elif any(c in lower for c in vague_cues) and len(hits) < 2:
        quality = "unclear"
        score = 2
        status = "INSUFFICIENT_EVIDENCE"
    else:
        quality = "ok"
        score = 3 if len(hits) >= 1 else 2
        status = "scored" if words >= 25 and len(hits) >= 1 else "INSUFFICIENT_EVIDENCE"

    missing = []
    facets = facets_for(competency)
    for facet in facets[:4]:
        if facet.lower() not in lower and facet.lower() not in [h.lower() for h in hits]:
            missing.append(facet)
    if not missing and status == "INSUFFICIENT_EVIDENCE":
        missing = ["concrete architecture", "failure handling"]

    prior = state.evidence_counts.get(competency, 0)
    enough = prior + (1 if status == "scored" else 0) >= MIN_EVIDENCE_FOR_SCORE

    quote = answer[:160].strip()
    evidence = [quote] if words >= 8 else []
    if hits:
        evidence.append(f"concepts:{','.join(hits[:5])}")

    return EvaluationResult(
        competencies=[competency],
        correctness=score,
        depth=score,
        reasoning=max(1, score - (0 if hits else 1)),
        clarity=3 if words >= 20 else 2,
        evidence=evidence,
        missing_points=missing[:4],
        confidence=0.35 if status == "INSUFFICIENT_EVIDENCE" else min(0.85, 0.45 + 0.1 * len(hits)),
        status=status,
        quote=quote,
        probe_hint=missing[0] if missing else "trade-offs",
        score_0_to_5=float(score),
        answer_quality=quality,  # type: ignore[arg-type]
        enough_evidence=enough,
    )


def decide_next_action(state: InterviewState, evaluation: EvaluationResult) -> str:
    """Code-owned state machine: weak→probe, strong→advance, don't jump topics blindly."""
    budget = int(state.plan.get("question_budget") or 8)
    if state.questions_asked >= budget or state.time_remaining <= 60:
        return "END"

    quality = evaluation.answer_quality or "ok"
    competency = state.current_competency or "general"
    planned = _planned_competency(state, competency)
    min_ev = int(planned.get("min_evidence") or MIN_EVIDENCE_FOR_SCORE)
    evidence_n = state.evidence_counts.get(competency, 0)

    # Intro is icebreaker only — open first competency probe.
    if state.current_section == "introduction" and state.probe_level < MAX_PROBE_LEVEL:
        return "FOLLOW_UP"

    # Incorrect / unclear → clarify (rephrase / dig), don't skip topic.
    if quality in {"incorrect", "unclear"} and state.probe_level < MAX_PROBE_LEVEL:
        return "CLARIFY"
    if quality == "weak" and state.probe_level < MAX_PROBE_LEVEL:
        return "FOLLOW_UP"

    thin = evaluation.status == "INSUFFICIENT_EVIDENCE" or evaluation.depth <= 2
    if thin and state.probe_level < MAX_PROBE_LEVEL:
        return "FOLLOW_UP"

    # Strong answer but not enough progressive probes yet → go deeper once.
    if quality == "strong" and state.probe_level < 2 and state.probe_level < MAX_PROBE_LEVEL:
        return "FOLLOW_UP"

    # Need enough evidence before closing a competency.
    if evidence_n < min_ev and state.probe_level < MAX_PROBE_LEVEL:
        return "FOLLOW_UP"

    if state.probe_level < MAX_PROBE_LEVEL and quality == "ok" and evaluation.score_0_to_5 < 4:
        # One more probe if mid-quality
        if state.probe_level < 3:
            return "FOLLOW_UP"

    queue = [
        c
        for c in (state.competency_queue or [])
        if c and c.lower() != competency.lower()
    ]
    if queue:
        return "MOVE_TOPIC"
    return "END"


def _planned_competency(state: InterviewState, name: str) -> dict[str, Any]:
    for item in state.plan.get("competencies") or []:
        if isinstance(item, dict) and str(item.get("name") or "").lower() == name.lower():
            return item
    return {}


def probe_question(state: InterviewState, evaluation: EvaluationResult, context: dict[str, Any]) -> GeneratedQuestion:
    level = min(max(state.probe_level, 1), MAX_PROBE_LEVEL)
    planned = _planned_competency(state, state.current_competency)
    ladder = planned.get("probe_levels") or []
    project = clean_topic_name(str(planned.get("project") or state.current_project or ""))
    claim = str(planned.get("claim") or state.current_claim or "")

    if 0 <= level - 1 < len(ladder):
        text = str(ladder[level - 1])
    else:
        hint = evaluation.probe_hint or (evaluation.missing_points[0] if evaluation.missing_points else "trade-offs")
        quote = (evaluation.quote or "")[:120]
        if level <= 1:
            if claim:
                text = f"You wrote “{claim[:90]}”. Walk me through the architecture and what you personally owned."
            else:
                text = f"Walk me through the architecture you used for {state.current_competency or 'this work'}."
        elif level == 2:
            text = (
                f"You mentioned “{quote}”. What was that component actually responsible for?"
                if quote
                else f"What was the core component responsible for in your {state.current_competency} work?"
            )
        elif level == 3:
            text = f"Why did you choose that approach instead of a simpler alternative for {hint}?"
        else:
            text = f"Describe one failure case around {hint} and how you handled it."

    # Prefer claim-grounded wording over generic definitions
    if re.search(r"\bwhat is\b|\bdefine\b|\bexplain what\b", text, re.I) and (claim or project):
        anchor = project or claim[:60]
        text = f"You used this in {anchor}. How did you handle {evaluation.probe_hint or 'edge cases'} in practice?"

    text = _sanitize_spoken_question(text, state.current_competency or "this work")
    return GeneratedQuestion(
        question=text,
        competency=state.current_competency or "technical",
        difficulty=state.difficulty,
        expected_concepts=evaluation.missing_points or ["depth"],
        source="probe",
    )


def next_competency_from_queue(state: InterviewState) -> str:
    current = (state.current_competency or "").lower()
    for name in state.competency_queue or []:
        if name.lower() != current:
            return name
    names = [
        str(c.get("name"))
        for c in (state.plan.get("competencies") or [])
        if isinstance(c, dict) and c.get("name")
    ]
    for name in names:
        if name.lower() != current:
            return name
    return state.current_competency or "technical"


async def evaluate_answer(
    llm: LLMProvider,
    state: InterviewState,
    answer: str,
    context: dict[str, Any],
) -> EvaluationResult:
    competency = state.current_competency or "general"
    system, version = get_prompt("answer_evaluator")
    try:
        result = await llm.structured_output(
            [
                {
                    "role": "system",
                    "content": system
                    + " Score technical evidence only, never confidence or personality. "
                    "quote = a short snippet from the answer. missing_points = what was not evidenced. "
                    "probe_hint = the next technical thing to test. "
                    "answer_quality = weak|ok|strong|incorrect|unclear. "
                    "enough_evidence = true only if this competency has concrete multi-point evidence.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Competency: {competency}\n"
                        f"Claim under test: {state.current_claim}\n"
                        f"Project: {state.current_project}\n"
                        f"Prior evidence count: {state.evidence_counts.get(competency, 0)}\n"
                        f"Question: {state.last_question}\n"
                        f"Answer: {answer}\n"
                        f"Profile skills: {(state.candidate_profile or {}).get('skills')}\n"
                        f"Do not reward sounding confident. Require concrete evidence."
                    ),
                },
            ],
            EvaluationResult,
            meta={"prompt_name": "answer_evaluator", "prompt_version": version},
        )
        result.competencies = result.competencies or [competency]
        if not result.quote:
            result.quote = answer[:160].strip()
        if not result.score_0_to_5:
            result.score_0_to_5 = (
                result.correctness + result.depth + result.reasoning + result.clarity
            ) / 4.0
        if not result.answer_quality:
            if result.status == "INSUFFICIENT_EVIDENCE":
                result.answer_quality = "weak"
            elif result.score_0_to_5 >= 4:
                result.answer_quality = "strong"
            else:
                result.answer_quality = "ok"
        return result
    except Exception:
        return heuristic_evaluation(state, answer)


def apply_evaluation(state: InterviewState, evaluation: EvaluationResult, answer: str) -> None:
    competency = (evaluation.competencies or [state.current_competency or "general"])[0]
    quotes = [q for q in ([evaluation.quote] + list(evaluation.evidence or [])) if q]
    if quotes:
        state.competency_evidence.setdefault(competency, [])
        for q in quotes[:2]:
            if q not in state.competency_evidence[competency]:
                state.competency_evidence[competency].append(q)

    quality = evaluation.answer_quality or "ok"
    if quality == "strong":
        state.consecutive_strong += 1
        state.consecutive_weak = 0
        if state.difficulty == "medium" and state.consecutive_strong >= 2:
            state.difficulty = "hard"
    elif quality in {"weak", "incorrect", "unclear"}:
        state.consecutive_weak += 1
        state.consecutive_strong = 0
        if state.difficulty == "hard" and state.consecutive_weak >= 2:
            state.difficulty = "medium"
        elif state.difficulty == "medium" and state.consecutive_weak >= 3:
            state.difficulty = "easy"
    else:
        state.consecutive_strong = 0
        state.consecutive_weak = 0

    scored_this_turn = evaluation.status != "INSUFFICIENT_EVIDENCE"
    if scored_this_turn:
        state.evidence_counts[competency] = state.evidence_counts.get(competency, 0) + 1

    state.evidence_log.append(
        {
            "competency": competency,
            "question": state.last_question,
            "answer": answer[:600],
            "score_0_to_5": evaluation.score_0_to_5 or evaluation.depth,
            "status": evaluation.status,
            "answer_quality": quality,
            "evidence": quotes[:3],
            "missing_points": evaluation.missing_points,
            "probe_level": state.probe_level,
            "confidence": evaluation.confidence,
        }
    )

    if evaluation.status == "INSUFFICIENT_EVIDENCE":
        state.flags.append("insufficient_evidence")
        if state.current_claim:
            state.claims_status[state.current_claim] = "unverified"
        return

    # Gate final competency score until enough evidence exists.
    enough = state.evidence_counts.get(competency, 0) >= MIN_EVIDENCE_FOR_SCORE or evaluation.enough_evidence
    if not enough:
        if state.current_claim:
            state.claims_status[state.current_claim] = "partial"
        return

    score_100 = max(0.0, min(100.0, (evaluation.score_0_to_5 or 0) * 20.0))
    prev = state.competency_scores.get(competency)
    state.competency_scores[competency] = score_100 if prev is None else (prev + score_100) / 2
    if state.current_claim:
        state.claims_status[state.current_claim] = "supported" if score_100 >= 60 else "weak"


def update_memory_summary(state: InterviewState, answer: str, evaluation: EvaluationResult) -> None:
    """Rolling structured memory so free models don't rely on raw chat alone."""
    bits = []
    if state.current_competency:
        bits.append(f"Focus:{state.current_competency}")
    if state.current_project:
        bits.append(f"Project:{state.current_project}")
    if state.current_claim:
        bits.append(f"Claim:{state.current_claim[:60]}")
    bits.append(f"Quality:{evaluation.answer_quality}")
    bits.append(f"Probe:{state.probe_level}")
    if evaluation.missing_points:
        bits.append(f"Missing:{','.join(evaluation.missing_points[:2])}")
    snippet = " ".join((answer or "").split())[:100]
    if snippet:
        bits.append(f"Said:{snippet}")
    line = " | ".join(bits)
    prev = (state.memory_summary or "").strip()
    state.memory_summary = (prev + "\n" + line).strip()[-1200:]


def draft_report_from_state(state: InterviewState, context: dict[str, Any]) -> ReportDraft:
    scores = state.competency_scores or {}
    overall = sum(scores.values()) / max(len(scores), 1) if scores else 0.0
    if len(state.evidence_log) < 2 or not scores:
        rec = "insufficient_evidence"
    elif overall >= 80:
        rec = "strong_yes"
    elif overall >= 65:
        rec = "yes"
    elif overall >= 50:
        rec = "maybe"
    else:
        rec = "no"

    strengths = []
    for name, score in sorted(scores.items(), key=lambda x: -x[1])[:4]:
        snippets = state.competency_evidence.get(name) or []
        why = snippets[0][:120] if snippets else "multiple concrete answers"
        strengths.append(f"{name}: {score:.0f}/100 — {why}")
    weaknesses = []
    for name, score in sorted(scores.items(), key=lambda x: x[1]):
        if score >= 60:
            continue
        missing = []
        for row in state.evidence_log:
            if row.get("competency") == name:
                missing.extend(row.get("missing_points") or [])
        why = ", ".join(dict.fromkeys(missing))[:120] or "thin evidence"
        weaknesses.append(f"{name}: {score:.0f}/100 — {why}")
    evidence = []
    for row in state.evidence_log:
        for item in row.get("evidence") or []:
            if item.startswith("concepts:"):
                continue
            evidence.append(f"{row.get('competency')}: {item}")
    resume_validation = [
        {"claim": claim, "status": status}
        for claim, status in (state.claims_status or {}).items()
    ]
    gaps = list(state.plan.get("gaps") or [])
    return ReportDraft(
        overall_score=round(overall, 1),
        recommendation=rec,
        strengths=strengths or ["Limited scored evidence"],
        weaknesses=weaknesses or gaps[:3],
        evidence=evidence[-8:],
        resume_validation=resume_validation,
        technical_gaps=gaps,
        behavioral_observations=[],
        recommended_next_step="Human recruiter should review the evidence table before any hiring decision.",
        competency_scores=scores,
    )
