"""Conversation manager + LangGraph-style interview agent."""
from __future__ import annotations

import asyncio
import re
from typing import Any, Optional

from ai_recruiter.evaluator import (
    _sanitize_spoken_question,
    apply_evaluation,
    decide_next_action,
    draft_report_from_state,
    heuristic_evaluation,
    is_topic_covered,
    next_competency_from_queue,
    probe_question,
    topic_key,
    update_memory_summary,
)
from ai_recruiter.planner import build_interview_plan, clean_topic_name, heuristic_plan
from ai_recruiter.prompts.registry import get_prompt
from ai_recruiter.providers.llm import LLMProvider
from ai_recruiter.schemas import (
    AnswerAnalysis,
    CandidateIntent,
    EvaluationResult,
    GeneratedQuestion,
    GuardrailResult,
    InterviewPlan,
    InterviewState,
    ReportDraft,
)


def _normalize_q(text: str) -> str:
    return " ".join((text or "").strip().lower().split())


def _ground_with_rag(question: GeneratedQuestion, hits: list[dict[str, Any]]) -> GeneratedQuestion:
    """Keep the probe ladder, but name a concrete resume/JD excerpt when available."""
    excerpt = ""
    for hit in hits:
        content = str(hit.get("content") or "").strip()
        if len(content) > 40:
            excerpt = content[:110].rsplit(" ", 1)[0]
            break
    if excerpt and excerpt.lower() not in question.question.lower():
        question.question = f"{question.question} Ground this in: “{excerpt}”."
        question.source = "probe_rag"
    return question


def _history_transcript(state: InterviewState, limit: int = 8) -> str:
    lines: list[str] = []
    for turn in state.conversation_history[-limit:]:
        role = "Sarah" if turn.get("role") == "interviewer" else "Candidate"
        content = str(turn.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines) if lines else "(none yet)"


def _asked_question_texts(state: InterviewState) -> set[str]:
    """Every interviewer question already asked in this session (full history, not just last)."""
    asked: set[str] = set()
    if state.last_question:
        asked.add(_normalize_q(state.last_question))
    for turn in state.conversation_history:
        if turn.get("role") == "interviewer":
            content = _normalize_q(str(turn.get("content") or ""))
            if content:
                asked.add(content)
    return asked


def _is_repeat_question(question: str, state: InterviewState) -> bool:
    return _normalize_q(question) in _asked_question_texts(state)


def _strip_echoed_prompt(answer: str, state: InterviewState) -> str:
    """Mic often captures Sarah's last question before the candidate's real reply."""
    text = (answer or "").strip()
    last = (state.last_question or "").strip()
    if not text:
        return text
    if last:
        last_l = last.lower()
        text_l = text.lower()
        if text_l.startswith(last_l):
            text = text[len(last) :].strip(" .,!?-")
            text_l = text.lower()
        else:
            sentences = [s.strip() for s in re.split(r"[.?!]", last) if len(s.strip()) > 18]
            for sent in reversed(sentences):
                sl = sent.lower()
                idx = text_l.find(sl)
                if idx != -1 and idx < 160:
                    text = text[idx + len(sent) :].lstrip(" .,!?-")
                    text_l = text.lower()
                    break
            else:
                words = last.split()
                if len(words) >= 8:
                    tail = " ".join(words[-10:]).lower()
                    idx = text_l.find(tail)
                    if idx != -1 and idx < 180:
                        text = text[idx + len(tail) :].lstrip(" .,!?-")
    return text.strip() or (answer or "").strip()


class ConversationManager:
    def __init__(self, llm: LLMProvider, rag_retrieve=None) -> None:
        self.llm = llm
        self.rag_retrieve = rag_retrieve

    async def start(self, state: InterviewState, context: dict[str, Any]) -> tuple[InterviewState, str]:
        existing = context.get("interview_plan") or (state.plan if state.plan.get("competencies") else None)
        if existing and (existing.get("competencies") if isinstance(existing, dict) else None):
            plan = InterviewPlan.model_validate(existing)
        else:
            try:
                plan = await build_interview_plan(self.llm, context)
            except Exception:
                plan = heuristic_plan(context)

        state.plan = {**(context.get("interview_plan") or {}), **plan.model_dump()}
        comps = [
            str(c.get("name"))
            for c in (state.plan.get("competencies") or [])
            if isinstance(c, dict) and c.get("name")
        ]
        state.competency_queue = comps
        state.pending_mandatory = list(plan.mandatory_questions or [])
        state.time_remaining = plan.duration_minutes * 60
        state.current_section = "introduction"
        state.probe_level = 0
        state.candidate_profile = (
            plan.candidate_profile
            or state.plan.get("candidate_profile")
            or context.get("candidate_profile")
            or {}
        )
        first_comp = comps[0] if comps else "resume"
        first_item = next(
            (c for c in (state.plan.get("competencies") or []) if isinstance(c, dict) and c.get("name") == first_comp),
            {},
        )
        state.current_competency = first_comp
        state.current_claim = str(first_item.get("claim") or "")
        state.current_project = clean_topic_name(str(first_item.get("project") or "")) or ""
        state.asked_questions = []
        state.asked_topic_keys = []
        state.evidence_counts = {}
        state.memory_summary = (
            f"Candidate: {context.get('candidate_name') or 'unknown'}. "
            f"Role: {context.get('job_title') or 'role'}. "
            f"Plan competencies: {', '.join(comps)}. "
            f"Projects: {', '.join(plan.projects or [])}. "
            f"Gaps: {', '.join(plan.gaps or [])}."
        )

        name = context.get("interviewer_name") or "Sarah"
        role = context.get("job_title") or "role"
        candidate = (context.get("candidate_name") or "").strip()
        first = candidate.split()[0].title() if candidate else "there"
        intro = (
            f"Hi {first}, I'm {name}. Thanks for joining this {role} interview. "
            "Speak naturally — if you want me to repeat something, just say so. "
            "To get started, tell me about yourself and walk me through your resume."
        )
        state.last_question = intro
        state.conversation_history.append({"role": "interviewer", "content": intro})
        return state, intro

    async def process_answer(
        self, state: InterviewState, answer: str, context: dict[str, Any]
    ) -> tuple[InterviewState, str, dict[str, Any]]:
        if state.paused:
            return state, "The interview is paused. Resume when you're ready.", {"action": "PAUSED"}

        answer = _strip_echoed_prompt(answer, state)
        state.conversation_history.append({"role": "candidate", "content": answer})

        # Stay on the same question until a real reply or explicit "I don't know".
        if _is_non_answer(answer) and _detect_meta_kind(answer) != "DONT_KNOW":
            q = (state.last_question or "").strip()
            reply = (
                "I'm still on that question — answer when you're ready, "
                "or say you don't know and we'll move on."
            )
            # Keep last_question unchanged so the UI pin stays put.
            state.conversation_history.append({"role": "interviewer", "content": reply})
            return state, reply, {"action": "AWAIT_ANSWER", "pinned_question": q}

        # Hard early path: "which project?" — always name resume projects when available.
        if _is_scope_clarification(answer):
            reply = _clarify_with_resume(state, answer, context)
            names = _resume_project_names(context, state)
            # Never answer without names if we can recover them.
            if names and not any(n.lower() in reply.lower() for n in names[:3]):
                shown = ", ".join(names[:3])
                current = clean_topic_name(state.current_project or "")
                if current:
                    reply = (
                        f"I meant your {current} project from your resume. "
                        f"Other options I see: {shown}. "
                        "Walk me through the problem, what you built, and what you owned."
                    )
                else:
                    reply = (
                        f"From your resume I see {shown}. "
                        "Which one should we dig into — problem, your role, and the tech?"
                    )
            if names and not state.current_project:
                state.current_project = names[0]
            state.flags.append("CLARIFY_SCOPE")
            state.last_question = reply
            state.last_action = "CLARIFY_SCOPE"
            state.asked_questions.append(reply)
            key = topic_key(reply)
            if key and key not in state.asked_topic_keys:
                state.asked_topic_keys.append(key)
            state.conversation_history.append({"role": "interviewer", "content": reply})
            return state, reply, {"action": "CLARIFY_SCOPE"}

        meta_kind = _detect_meta_kind(answer)
        if meta_kind == "AUDIO":
            q = state.last_question or "Could you tell me about yourself?"
            reply = f"Sorry about that — I'll speak more clearly. Here's the question again. {q}"
            state.conversation_history.append({"role": "interviewer", "content": reply})
            return state, reply, {"action": "REPEAT", "reason": "audio"}

        if meta_kind == "REPEAT":
            q = state.last_question or "Could you tell me about yourself?"
            reply = f"Of course. {q}"
            state.conversation_history.append({"role": "interviewer", "content": reply})
            return state, reply, {"action": "REPEAT", "reason": "repeat"}

        if meta_kind == "WAIT":
            reply = "No problem — take your time. Just continue whenever you're ready."
            state.conversation_history.append({"role": "interviewer", "content": reply})
            return state, reply, {"action": "WAIT"}

        if meta_kind == "CONFUSED":
            reply = _simpler_paraphrase(state)
            state.last_question = reply
            state.conversation_history.append({"role": "interviewer", "content": reply})
            return state, reply, {"action": "PARAPHRASE"}

        if meta_kind == "DONT_KNOW":
            reply = "That's alright — we can move on. Let me ask something related from another angle."
            evaluation = EvaluationResult(
                competencies=[state.current_competency or "general"],
                status="INSUFFICIENT_EVIDENCE",
                evidence=["Candidate indicated they did not know."],
                missing_points=["concrete evidence for this claim"],
                confidence=0.4,
                score_0_to_5=1.0,
            )
            apply_evaluation(state, evaluation, answer)
            nxt = next_competency_from_queue(state)
            state.competency_queue = [
                c
                for c in state.competency_queue
                if c.lower() != (state.current_competency or "").lower()
            ]
            state.current_competency = nxt
            state.probe_level = 1
            planned = next(
                (
                    c
                    for c in (state.plan.get("competencies") or [])
                    if isinstance(c, dict) and str(c.get("name") or "").lower() == nxt.lower()
                ),
                {},
            )
            state.current_claim = str(planned.get("claim") or "")
            state.current_project = clean_topic_name(str(planned.get("project") or "")) or ""
            q = _heuristic_next_question(state, context, force_different=True)
            state.questions_asked += 1
            state.last_question = q.question
            spoken = f"{reply} {q.question}"
            state.conversation_history.append({"role": "interviewer", "content": spoken})
            return state, spoken, {
                "action": "MOVE_TOPIC",
                "question": q.model_dump(),
                "evaluation": evaluation.model_dump(),
                "probe_level": state.probe_level,
                "competency": state.current_competency,
            }

        intent = await self._classify(answer)
        if intent.intent in {"OFF_TOPIC", "UNSAFE"}:
            reply = intent.reply or "Let's stay focused on the interview."
            state.conversation_history.append({"role": "interviewer", "content": reply})
            state.flags.append(intent.intent)
            return state, reply, {"action": "REDIRECT", "intent": intent.intent}

        if intent.intent == "COMPANY_INFORMATION":
            reply = await self._company_answer(answer, context)
            state.conversation_history.append({"role": "interviewer", "content": reply})
            return state, reply, {"action": "COMPANY_QA"}

        scope_hint = False
        evaluation = heuristic_evaluation(state, answer)
        apply_evaluation(state, evaluation, answer)
        update_memory_summary(state, answer, evaluation)
        action = decide_next_action(state, evaluation)

        if action == "END":
            closing = "Thanks — that covers what I needed. I'll wrap up the interview now."
            state.conversation_history.append({"role": "interviewer", "content": closing})
            state.current_section = "end"
            state.last_action = "END"
            return state, closing, {"action": "END", "evaluation": evaluation.model_dump()}

        if action in {"FOLLOW_UP", "CLARIFY", "CLARIFY_SCOPE"}:
            state.probe_level = min(4, (state.probe_level or 0) + 1)
            state.followups_used += 1
            # Keep project/claim labels synced for UI while probing the same competency.
            planned = next(
                (
                    c
                    for c in (state.plan.get("competencies") or [])
                    if isinstance(c, dict)
                    and str(c.get("name") or "").lower() == (state.current_competency or "").lower()
                ),
                {},
            )
            if planned.get("claim"):
                state.current_claim = str(planned.get("claim") or "")
            if planned.get("project"):
                state.current_project = clean_topic_name(str(planned.get("project") or "")) or state.current_project
        else:
            nxt = next_competency_from_queue(state)
            state.competency_queue = [
                c for c in state.competency_queue if c.lower() != (state.current_competency or "").lower()
            ]
            state.current_competency = nxt
            state.probe_level = 1
            planned = next(
                (
                    c
                    for c in (state.plan.get("competencies") or [])
                    if isinstance(c, dict) and str(c.get("name") or "").lower() == nxt.lower()
                ),
                {},
            )
            state.current_claim = str(planned.get("claim") or "")
            state.current_project = clean_topic_name(str(planned.get("project") or "")) or ""

        # Voice-fast path: claim ladder / heuristics only — no LLM wait on the hot path.
        if action in {"FOLLOW_UP", "CLARIFY", "CLARIFY_SCOPE"}:
            q = probe_question(state, evaluation, context)
            if is_topic_covered(q.question, state) or _is_repeat_question(q.question, state):
                q = _heuristic_next_question(state, context, force_different=True)
        else:
            q = _heuristic_next_question(state, context, force_different=True)
        if _is_repeat_question(q.question, state) or is_topic_covered(q.question, state):
            q = _heuristic_next_question(state, context, force_different=True)

        guard = await self._guardrail(q.question, context)
        if not guard.allowed or _is_repeat_question(q.question, state):
            q = _heuristic_next_question(state, context, force_different=True)

        state.questions_asked += 1
        state.last_question = q.question
        state.last_action = action
        state.current_competency = q.competency or state.current_competency
        state.topics_covered[state.current_competency] = state.topics_covered.get(state.current_competency, 0) + 1
        state.asked_questions.append(q.question)
        key = topic_key(q.question)
        if key and key not in state.asked_topic_keys:
            state.asked_topic_keys.append(key)
        if state.current_section == "introduction":
            state.current_section = "resume"
        elif state.probe_level >= 2:
            state.current_section = "technical"
        state.conversation_history.append({"role": "interviewer", "content": q.question})
        if len(state.conversation_history) > 40:
            state.conversation_history = state.conversation_history[-30:]

        return (
            state,
            q.question,
            {
                "action": action,
                "question": q.model_dump(),
                "evaluation": evaluation.model_dump(),
                "probe_level": state.probe_level,
                "competency": state.current_competency,
                "memory_summary": state.memory_summary,
            },
        )

    async def handle_interrupt(self, state: InterviewState) -> InterviewState:
        state.flags.append("interrupted")
        return state

    async def repeat_question(self, state: InterviewState) -> str:
        return state.last_question or "I don't have a prior question to repeat."

    async def clarify(self, state: InterviewState, utterance: str) -> str:
        return (
            "Sure — I want your practical experience, not a textbook definition. "
            "Focus on what you personally built and why."
        )

    async def _generate_question(
        self,
        state: InterviewState,
        context: dict[str, Any],
        *,
        last_answer: str = "",
        action: str = "FOLLOW_UP",
    ) -> GeneratedQuestion:
        # Plan-ladder first — claim-grounded, never generic "what is X?"
        heuristic = probe_question(
            state,
            EvaluationResult(
                competencies=[state.current_competency or "general"],
                missing_points=["depth"],
                probe_hint="architecture",
                quote=last_answer[:120],
                answer_quality="ok",
            ),
            context,
        )
        if action == "CLARIFY_SCOPE":
            heuristic = GeneratedQuestion(
                question=_clarify_with_resume(state, last_answer, context),
                competency=state.current_competency or "resume",
                difficulty=state.difficulty,
                expected_concepts=["project", "ownership"],
                source="clarify",
            )
        elif action == "MOVE_TOPIC":
            heuristic = _heuristic_next_question(state, context, force_different=True)
        elif action == "PARAPHRASE":
            heuristic = GeneratedQuestion(
                question=_simpler_paraphrase(state),
                competency=state.current_competency or "general",
                difficulty=state.difficulty,
                expected_concepts=["clarity"],
                source="paraphrase",
            )

        system, version = get_prompt("question_generator")
        profile = state.candidate_profile or state.plan.get("candidate_profile") or context.get("candidate_profile") or {}
        if not profile:
            from ai_recruiter.planner import _structured_candidate_profile

            profile = _structured_candidate_profile(context)
        asked = list(state.asked_questions or [])[-8:]
        user_prompt = (
            f"Action: {action}\n"
            f"Difficulty: {state.difficulty}\n"
            f"Role: {context.get('job_title') or 'this role'}\n"
            f"Competency: {state.current_competency or 'resume'}\n"
            f"Current claim to verify: {state.current_claim}\n"
            f"Current project: {state.current_project}\n"
            f"Probe level (1-4 progressive): {state.probe_level}\n"
            f"Last question: {state.last_question}\n"
            f"Last answer: {last_answer}\n"
            f"Memory summary:\n{state.memory_summary or '(none)'}\n"
            f"Already asked (do not repeat wording OR topic):\n- "
            + "\n- ".join(asked[:8])
            + "\n"
            f"STRUCTURED CANDIDATE PROFILE (use this — do not invent):\n{profile}\n"
            f"JD required: {context.get('jd_required_skills')}\n"
            f"JD preferred: {context.get('jd_preferred_skills')}\n"
            f"Gaps: {(context.get('match') or {}).get('missing') or state.plan.get('gaps')}\n"
            f"Suspicious claims: {(context.get('match') or {}).get('suspicious_claims') or state.plan.get('suspicious_claims')}\n"
            f"Seed question (refine, keep claim-grounded): {heuristic.question}\n"
            "Rules: Never ask 'What is X?'. Always ground in resume claim/project. "
            "One short spoken question only."
        )
        try:
            generated = await asyncio.wait_for(
                self.llm.structured_output(
                    [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_prompt},
                    ],
                    GeneratedQuestion,
                    temperature=0.35,
                    max_tokens=400,
                    meta={"prompt_name": "question_generator", "prompt_version": version},
                ),
                timeout=12.0,
            )
            text = _sanitize_spoken_question(
                (generated.question or "").strip(),
                generated.competency or state.current_competency or "this work",
            )
            if not text or _is_repeat_question(text, state) or is_topic_covered(text, state):
                return heuristic
            # Reject generic definition questions when we have resume evidence
            if re.search(r"\bwhat is\b|\bdefine\b", text, re.I) and (
                state.current_claim or state.current_project or (profile.get("projects") if isinstance(profile, dict) else None)
            ):
                return heuristic
            generated.question = text
            generated.source = generated.source or "llm_followup"
            return generated
        except Exception:
            return heuristic

    async def _followup(self, state: InterviewState, analysis: AnswerAnalysis, context: dict[str, Any]) -> GeneratedQuestion:
        last_candidate = ""
        for turn in reversed(state.conversation_history):
            if turn.get("role") == "candidate":
                last_candidate = turn.get("content", "")
                break
        missing = ", ".join(analysis.missing_concepts) or "trade-offs and evaluation"
        project = _pick_project(context, state)
        last_q = (state.last_question or "").lower()

        if project and project.lower() in last_q:
            # Already on this project — dig into what they just said
            snippet = last_candidate[:140].strip() or missing
            question = (
                f"Thanks — you said “{snippet}”. "
                f"How did you measure whether that actually worked, and what broke in production?"
            )
            competency = state.current_competency or "technical"
        elif state.current_section in {"introduction", "resume"} and project:
            question = (
                f"Thanks. Let's stay on {project}. "
                f"What was your specific role, and how did you know it was working well in practice?"
            )
            competency = "resume"
        elif project and analysis.followup_needed:
            question = (
                f"Interesting — for {project}, can you go deeper on {missing}? "
                f"What did you try, and what would you change next time?"
            )
            competency = state.current_competency or "technical"
        else:
            snippet = last_candidate[:120].strip()
            question = (
                f"You mentioned “{snippet}…”. Can you unpack that — what decisions did you make and why?"
                if snippet
                else f"Got it. One follow-up: how did you handle {missing}?"
            )
            competency = state.current_competency or "general"
        return GeneratedQuestion(
            question=question,
            competency=competency,
            difficulty=state.difficulty,
            expected_concepts=analysis.missing_concepts,
            source="followup",
        )

    async def pause(self, state: InterviewState) -> InterviewState:
        state.paused = True
        return state

    async def resume(self, state: InterviewState) -> tuple[InterviewState, str]:
        state.paused = False
        msg = "Welcome back. " + (state.last_question or "Let's continue.")
        return state, msg

    async def handle_candidate_question(self, state: InterviewState, text: str, context: dict[str, Any]) -> str:
        intent = await self._classify(text)
        if intent.intent == "COMPANY_INFORMATION":
            return await self._company_answer(text, context)
        return intent.reply or await self.clarify(state, text)

    async def finish(self, state: InterviewState, context: dict[str, Any]) -> ReportDraft:
        draft = draft_report_from_state(state, context)
        system, version = get_prompt("report_generator")
        try:
            polished = await self.llm.structured_output(
                [
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": (
                            f"Turn this evidence-based draft into a recruiter dossier. "
                            f"Do not invent scores. Keep competency_scores and resume_validation as given.\n"
                            f"{draft.model_dump_json()}\n"
                            f"Job: {context.get('job_title')}"
                        ),
                    },
                ],
                ReportDraft,
                meta={"prompt_name": "report_generator", "prompt_version": version},
            )
            polished.competency_scores = polished.competency_scores or draft.competency_scores
            polished.resume_validation = polished.resume_validation or draft.resume_validation
            polished.evidence = polished.evidence or draft.evidence
            polished.overall_score = draft.overall_score
            polished.recommendation = draft.recommendation
            return polished
        except Exception:
            return draft

    async def _plan(self, context: dict[str, Any]) -> InterviewPlan:
        system, version = get_prompt("interview_planner")
        try:
            return await self.llm.structured_output(
                [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Create an interview plan from:\n{context}"},
                ],
                InterviewPlan,
                meta={"prompt_name": "interview_planner", "prompt_version": version},
            )
        except Exception:
            return InterviewPlan(
                duration_minutes=int(context.get("duration_minutes", 30)),
                sections=["introduction", "resume", "technical", "behavioral", "candidate_questions"],
                competency_coverage=context.get("competencies") or {"Communication": 100},
                question_budget=8,
                difficulty_strategy=context.get("difficulty", "adaptive"),
                mandatory_questions=context.get("mandatory_questions") or [],
                resume_claims_to_validate=(context.get("match") or {}).get("claims_to_validate") or [],
            )

    async def _analyze(self, state: InterviewState, answer: str, context: dict[str, Any]) -> AnswerAnalysis:
        system, version = get_prompt("next_action_decider")
        try:
            return await self.llm.structured_output(
                [
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": f"Question: {state.last_question}\nAnswer: {answer}\nState: {state.model_dump()}",
                    },
                ],
                AnswerAnalysis,
                meta={"prompt_name": "next_action_decider", "prompt_version": version},
            )
        except Exception:
            return AnswerAnalysis(
                correctness=0.6,
                depth=0.5,
                missing_concepts=["depth"],
                followup_needed=len(answer.split()) < 40,
                recommended_action="FOLLOW_UP" if len(answer.split()) < 40 else "MOVE_TOPIC",
            )

    async def _evaluate(self, state: InterviewState, answer: str, context: dict[str, Any]) -> EvaluationResult:
        system, version = get_prompt("answer_evaluator")
        try:
            return await self.llm.structured_output(
                [
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": (
                            f"Rubric 0-5. Question: {state.last_question}\nAnswer: {answer}\n"
                            f"Competency: {state.current_competency}"
                        ),
                    },
                ],
                EvaluationResult,
                meta={"prompt_name": "answer_evaluator", "prompt_version": version},
            )
        except Exception:
            words = len(answer.split())
            score = 2 if words < 20 else 3 if words < 80 else 4
            return EvaluationResult(
                competencies=[state.current_competency or "general"],
                correctness=score,
                depth=score,
                reasoning=score,
                clarity=score,
                evidence=[answer[:180]],
                missing_points=[],
                confidence=0.55,
                status="scored" if words >= 15 else "INSUFFICIENT_EVIDENCE",
            )

    async def _guardrail(self, text: str, context: dict[str, Any]) -> GuardrailResult:
        banned = ["race", "religion", "gender", "sexual orientation", "disability", "age", "accent", "appearance"]
        lower = text.lower()
        if any(b in lower for b in banned):
            return GuardrailResult(allowed=False, reasons=["protected_attribute_risk"])
        return GuardrailResult(allowed=True, reasons=[])

    async def _classify(self, text: str) -> CandidateIntent:
        lower = text.lower()
        if any(x in lower for x in ["weather", "joke", "football", "movie"]):
            return CandidateIntent(
                intent="OFF_TOPIC",
                reply="Let's stay focused on the interview. We can come back to other questions after we're done.",
            )
        if any(x in lower for x in ["what do you mean", "clarify", "don't understand", "didnt understand", "samajh"]):
            return CandidateIntent(intent="CLARIFICATION", reply="")
        if any(x in lower for x in ["company", "benefits", "salary", "culture", "policy", "handbook"]):
            return CandidateIntent(intent="COMPANY_INFORMATION", reply="")
        return CandidateIntent(intent="INTERVIEW_RELATED", reply="")

    async def search_project_docs(self, query: str, context: dict[str, Any]) -> list[dict[str, Any]]:
        """On-demand RAG over ingested JD, resume, and company docs."""
        if not self.rag_retrieve:
            return []
        try:
            hits = await self.rag_retrieve(
                query=query or "technical experience",
                company_id=str(context.get("company_id") or ""),
                job_id=str(context.get("job_id") or ""),
                competency=None,
            )
            return hits or []
        except Exception:
            return []

    async def _company_answer(self, question: str, context: dict[str, Any]) -> str:
        if not self.rag_retrieve:
            return "I don't have verified information about that."
        hits = await self.rag_retrieve(
            query=question,
            company_id=str(context.get("company_id", "")),
            job_id=str(context.get("job_id", "")),
        )
        if not hits:
            return "I don't have verified information about that."
        return f"Based on verified company materials: {hits[0].get('content', '')[:500]}"

    def _update_scores(self, state: InterviewState, evaluation: EvaluationResult) -> None:
        if evaluation.status == "INSUFFICIENT_EVIDENCE":
            state.flags.append("insufficient_evidence")
            return
        avg = (evaluation.correctness + evaluation.depth + evaluation.reasoning + evaluation.clarity) / 4.0
        score_100 = avg * 20.0
        for c in evaluation.competencies or [state.current_competency or "general"]:
            prev = state.competency_scores.get(c)
            state.competency_scores[c] = score_100 if prev is None else (prev + score_100) / 2


def _resume_project_names(context: dict[str, Any], state: InterviewState | None = None) -> list[str]:
    """Best-effort project titles from profile, plan, match, and raw resume text."""
    names: list[str] = []

    def _add(raw: Any) -> None:
        if isinstance(raw, dict):
            item = clean_topic_name(str(raw.get("name") or raw.get("title") or ""))
        else:
            item = clean_topic_name(str(raw or ""))
        if item and item.lower() not in {c.lower() for c in names}:
            names.append(item)

    if state:
        _add(state.current_project)
        profile = state.candidate_profile or {}
        if isinstance(profile, dict):
            for p in profile.get("projects") or []:
                _add(p)
        for item in (state.plan or {}).get("competencies") or []:
            if isinstance(item, dict):
                _add(item.get("project"))
        for p in (state.plan or {}).get("projects") or []:
            _add(p)

    for p in context.get("resume_projects") or []:
        _add(p)
    profile = context.get("candidate_profile") or {}
    if isinstance(profile, dict):
        for p in profile.get("projects") or []:
            _add(p)
    for p in (context.get("match") or {}).get("relevant_projects") or []:
        _add(p)
    for p in (context.get("interview_plan") or {}).get("projects") or []:
        _add(p)

    if len(names) < 2:
        text = context.get("resume_text") or ""
        # Prefer an explicit Projects section when present.
        section = ""
        m = re.search(
            r"(?is)(?:^|\n)\s*projects?\s*(?:\n|:)\s*(.*?)(?=\n\s*(?:experience|education|skills|work|internships?|achievements|certifications)\b|\Z)",
            text,
        )
        if m:
            section = m.group(1)
        scan = section or text
        for line in scan.splitlines():
            stripped = line.strip(" -\t•*|")
            if not stripped or len(stripped) < 3:
                continue
            low = stripped.lower()
            if low.startswith(("technologies", "tech stack", "tools", "skills")):
                continue
            # "Improved — RAG chat" / "CreatorOS | FastAPI"
            titled = re.match(
                r"^([A-Z][A-Za-z0-9][A-Za-z0-9 ._-]{1,40}?)\s*(?:[—\-|:•]|–)\s+",
                stripped,
            )
            if titled:
                _add(titled.group(1))
                continue
            # Standalone TitleCase / CamelCase product-ish names
            alone = re.match(r"^([A-Z][A-Za-z0-9]+(?:OS|App|System|Platform|Bot|AI)?)\b", stripped)
            if alone and len(stripped.split()) <= 6:
                _add(alone.group(1))
            if len(names) >= 5:
                break

    return names[:5]


def _pick_project(context: dict[str, Any], state: InterviewState | None = None) -> str:
    if state and (state.current_project or "").strip():
        cur = clean_topic_name(state.current_project)
        if cur:
            return cur
    names = _resume_project_names(context, state)
    if not names:
        return ""
    idx = (state.questions_asked if state else 0) % len(names)
    return names[idx]


def _clarify_with_resume(state: InterviewState, answer: str, context: dict[str, Any]) -> str:
    """Always name resume projects when the candidate asks 'which project?'."""
    wants_choice = any(
        x in answer.lower()
        for x in ("free will", "any project", "any one", "my choice", "i pick", "i choose", "whichever")
    )
    names = _resume_project_names(context, state)
    current = clean_topic_name(state.current_project or "")
    if current and current not in names:
        names = [current, *[n for n in names if n.lower() != current.lower()]]

    # If we were already probing a named project, pin it explicitly.
    if current and not wants_choice:
        others = [n for n in names if n.lower() != current.lower()][:2]
        if others:
            return (
                f"I meant your {current} project from your resume. "
                f"If you’d rather talk about {', '.join(others)}, say which one — "
                "otherwise walk me through the problem, what you built, and what you owned."
            )
        return (
            f"I meant your {current} project from your resume. "
            "Walk me through the problem, what you built, and what you owned."
        )

    if names:
        shown = ", ".join(names[:3])
        if wants_choice:
            return (
                f"Sure — your call. From your resume I see {shown}. "
                "Pick one and walk me through the problem, what you built, and what you owned."
            )
        return (
            f"Good question — from your resume I see {shown}. "
            "Which one should we dig into? Tell me the problem, your role, and the tech."
        )

    skills = context.get("resume_skills") or (context.get("match") or {}).get("strong_matches") or []
    skill = skills[0] if skills else "your core stack"
    return (
        f"Pick any project from your resume you’re proud of, ideally involving {skill}. "
        "What problem it solved, what you built, and what you owned."
    )


def _is_scope_clarification(answer: str) -> bool:
    lower = answer.lower().strip()
    strong = [
        "which project",
        "what project",
        "for which project",
        "which one",
        "which experience",
        "which internship",
        "which part of my",
        "are you talking about",
        "any project",
        "free will",
        "kaunsa project",
        "konsa project",
        "kis project",
        "kaun se project",
        "kispe baat",
        "kis pe baat",
        "project ka naam",
        "project name",
    ]
    soft = [
        "which role",
        "what do you want me to",
        "what should i talk",
        "can you be more specific",
        "be more specific",
        "which part",
        "about what",
        "clarify the project",
    ]
    has_strong = any(c in lower for c in strong)
    has_soft = any(c in lower for c in soft)
    if not has_strong and not has_soft:
        return False
    words = lower.split()
    if len(words) > 55:
        return False
    # Strong "which project?" always wins — even if they also said "I worked…"
    if has_strong:
        return True
    substance = any(
        k in lower
        for k in ("i built", "i worked", "we used", "i created", "i implemented", "the architecture")
    )
    if substance and len(words) > 18:
        return False
    return True


def _simpler_paraphrase(state: InterviewState) -> str:
    topic = (state.current_competency or "that").strip()
    if state.current_section == "introduction":
        return (
            "No problem. Say it simply — who you are, what you study or work on, "
            "and one project you liked. That's enough to start."
        )
    return (
        f"No worries — I'll ask this more simply. In plain words: how did you use {topic}? "
        "What did you build, what were the main parts, and what did you do yourself?"
    )


def _heuristic_next_question(
    state: InterviewState, context: dict[str, Any], force_different: bool = False
) -> GeneratedQuestion:
    project = _pick_project(context, state)
    match = context.get("match") or {}
    strong = match.get("strong_matches") or context.get("resume_skills") or []
    missing = match.get("missing") or []
    claims = match.get("claims_to_validate") or state.plan.get("resume_claims_to_validate") or []
    asked = state.questions_asked + (1 if force_different else 0)
    jd_title = context.get("job_title") or "this role"

    bank: list[GeneratedQuestion] = []
    if project:
        bank.append(
            GeneratedQuestion(
                question=f"On your resume you mention {project}. Walk me through the architecture and your contributions.",
                competency="resume",
                difficulty=state.difficulty,
                expected_concepts=["architecture", "ownership", "impact"],
                source="resume",
            )
        )
        bank.append(
            GeneratedQuestion(
                question=f"For {project}, what was the hardest technical challenge and how did you debug it?",
                competency="Backend",
                difficulty=state.difficulty,
                expected_concepts=["debugging", "tradeoffs"],
                source="resume",
            )
        )
    if claims:
        bank.append(
            GeneratedQuestion(
                question=f"You wrote: “{str(claims[0])[:120]}”. How did you validate that in production?",
                competency="System Design",
                difficulty=state.difficulty,
                expected_concepts=["validation", "monitoring", "production"],
                source="resume",
            )
        )
    if strong:
        skill = strong[asked % len(strong)]
        bank.append(
            GeneratedQuestion(
                question=f"The {jd_title} role needs strong {skill}. Where have you used {skill} most recently, and what trade-offs did you make?",
                competency=str(skill),
                difficulty=state.difficulty,
                expected_concepts=[str(skill), "tradeoffs"],
                source="jd",
            )
        )
    if missing:
        gap = missing[asked % len(missing)]
        bank.append(
            GeneratedQuestion(
                question=f"{gap} appears on the job description but less clearly on your resume. How would you ramp up on {gap} if you joined?",
                competency=str(gap),
                difficulty=state.difficulty,
                expected_concepts=[str(gap), "learning"],
                source="jd",
            )
        )
    bank.append(
        GeneratedQuestion(
            question=f"For the {jd_title} role, how would you design a reliable service end-to-end — APIs, data, and failure handling?",
            competency="System Design",
            difficulty=state.difficulty,
            expected_concepts=["apis", "data", "reliability"],
            source="jd",
        )
    )

    # Avoid repeating any question already asked in this session
    previously = _asked_question_texts(state)
    for offset in range(len(bank)):
        q = bank[(asked + offset) % len(bank)]
        if _normalize_q(q.question) not in previously:
            return q
    return bank[asked % len(bank)] if bank else GeneratedQuestion(
        question="Tell me about a recent technical project you owned end-to-end.",
        competency="resume",
        difficulty=state.difficulty,
        expected_concepts=["ownership"],
        source="fallback",
    )


def _is_non_answer(answer: str) -> bool:
    """True when the utterance is empty / filler and should not unlock the next question."""
    text = (answer or "").strip()
    if not text:
        return True
    if _detect_meta_kind(text) in {"DONT_KNOW", "REPEAT", "WAIT", "AUDIO", "CONFUSED"}:
        return False
    if _is_scope_clarification(text):
        return False
    words = re.findall(r"[a-zA-Z']+", text.lower())
    if not words:
        return True
    fillers = {
        "um",
        "uh",
        "erm",
        "hmm",
        "hm",
        "ah",
        "oh",
        "ok",
        "okay",
        "yes",
        "yeah",
        "yep",
        "no",
        "nope",
        "right",
        "sure",
        "hello",
        "hi",
        "hey",
        "thanks",
        "thank",
        "you",
    }
    content = [w for w in words if w not in fillers]
    if len(content) < 3:
        return True
    return False


def _detect_meta_kind(answer: str) -> str | None:
    lower = answer.lower().strip()
    # Scope clarifications are handled separately
    if _is_scope_clarification(answer):
        return None
    audio_cues = [
        "not audible",
        "can't hear",
        "cannot hear",
        "couldn’t hear",
        "couldn't hear",
        "didn't hear",
        "did not hear",
        "speak up",
        "louder",
        "volume",
        "you're muted",
        "you are muted",
        "voice is low",
        "inaudible",
    ]
    if any(c in lower for c in audio_cues):
        return "AUDIO"
    repeat_cues = [
        "repeat the question",
        "repeat that",
        "say that again",
        "come again",
        "can you repeat",
        "could you repeat",
        "please repeat",
        "one more time",
        "say again",
    ]
    if any(c in lower for c in repeat_cues) or lower in {"repeat", "sorry?", "pardon"}:
        return "REPEAT"
    wait_cues = ["give me a second", "one second", "hold on", "let me think", "just a moment"]
    if any(c in lower for c in wait_cues) and len(lower.split()) < 12:
        return "WAIT"
    confused_cues = [
        "not able to understand",
        "don't understand",
        "dont understand",
        "didn't understand",
        "did not understand",
        "didn't get",
        "did not get",
        "i don't get",
        "what are you asking",
        "too complicated",
        "too complex",
        "can you simplify",
        "simplify",
        "simpler",
        "easy language",
        "explain simply",
        "in simple",
        "samajh nahi",
        "samajh nhi",
        "samajh nahi aaya",
        "kya matlab",
        "confused",
        "i'm lost",
        "im lost",
        "unclear",
        "pardon",
    ]
    if any(c in lower for c in confused_cues):
        return "CONFUSED"
    if any(
        c in lower
        for c in [
            "i don't know",
            "i do not know",
            "don't know",
            "dont know",
            "no idea",
            "not sure about that",
            "mujhe nahi pata",
            "pata nahi",
            "nahi pata",
            "skip this",
            "pass on this",
        ]
    ) and len(lower.split()) < 16:
        return "DONT_KNOW"
    return None


def _is_meta(answer: str) -> bool:
    if _detect_meta_kind(answer) or _is_scope_clarification(answer):
        return True
    lower = answer.lower().strip()
    # Do NOT treat "sorry but which project..." as generic meta — handled as scope clarification
    if lower.startswith("sorry") and _is_scope_clarification(answer):
        return True
    return any(lower.startswith(p) for p in ("can you repeat", "could you repeat", "what do you mean"))


def _bump(level: str, delta: int) -> str:
    order = ["easy", "medium", "hard"]
    if level not in order:
        level = "medium"
    idx = min(max(order.index(level) + delta, 0), len(order) - 1)
    return order[idx]
