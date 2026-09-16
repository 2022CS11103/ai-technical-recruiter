"""Conversation manager + LangGraph-style interview agent."""
from __future__ import annotations

from typing import Any, Optional

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


class ConversationManager:
    def __init__(self, llm: LLMProvider, rag_retrieve=None) -> None:
        self.llm = llm
        self.rag_retrieve = rag_retrieve

    async def start(self, state: InterviewState, context: dict[str, Any]) -> tuple[InterviewState, str]:
        # Plan in background-friendly way — never block greeting for long (ElevenLabs-style first message)
        try:
            import asyncio

            plan = await asyncio.wait_for(self._plan(context), timeout=2.0)
        except Exception:
            from ai_recruiter.schemas import InterviewPlan

            plan = InterviewPlan(
                duration_minutes=int(context.get("duration_minutes") or 30),
                sections=["introduction", "resume", "technical", "behavioral", "candidate_questions"],
                competency_coverage=context.get("competencies") or {"Communication": 100},
                question_budget=8,
                mandatory_questions=[],
                resume_claims_to_validate=(context.get("match") or {}).get("claims_to_validate") or [],
            )

        state.plan = plan.model_dump()
        state.pending_mandatory = list(plan.mandatory_questions)
        state.time_remaining = plan.duration_minutes * 60
        state.current_section = "introduction"

        # ElevenLabs-style first message: short, spoken greeting + one open question
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

        state.conversation_history.append({"role": "candidate", "content": answer})

        # Scope clarification ("which project?") — use resume, do NOT blindly repeat.
        if _is_scope_clarification(answer):
            reply = _clarify_with_resume(state, answer, context)
            state.last_question = reply
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

        if meta_kind == "DONT_KNOW":
            reply = "That's alright — we can move on. Let me ask something related from another angle."
            analysis = AnswerAnalysis(
                correctness=0.3,
                depth=0.2,
                missing_concepts=["candidate declined"],
                followup_needed=False,
                recommended_action="MOVE_TOPIC",
            )
            evaluation = EvaluationResult(
                competencies=[state.current_competency or "general"],
                status="INSUFFICIENT_EVIDENCE",
                evidence=["Candidate indicated they did not know."],
                confidence=0.4,
            )
            q = await self._generate_question(state, context)
            state.questions_asked += 1
            state.last_question = q.question
            spoken = f"{reply} {q.question}"
            state.conversation_history.append({"role": "interviewer", "content": spoken})
            return state, spoken, {
                "action": "MOVE_TOPIC",
                "question": q.model_dump(),
                "evaluation": evaluation.model_dump(),
                "analysis": analysis.model_dump(),
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

        # Content clarification (what do you mean by X?) — short answer, then continue same topic
        if intent.intent == "CLARIFICATION" and _asks_definition(answer):
            reply = await self.clarify(state, answer)
            # Immediately narrow to a resume-grounded question after clarifying
            follow = _clarify_with_resume(state, answer, context)
            spoken = f"{reply} {follow}"
            state.last_question = follow
            state.conversation_history.append({"role": "interviewer", "content": spoken})
            return state, spoken, {"action": "CLARIFY"}

        analysis = await self._analyze(state, answer, context)
        evaluation = await self._evaluate(state, answer, context)
        self._update_scores(state, evaluation)

        # Prefer follow-up on the same answer when depth is weak; otherwise move using resume/JD.
        if state.questions_asked >= int(state.plan.get("question_budget", 8)) or state.time_remaining <= 60:
            action = "END"
        elif analysis.followup_needed or analysis.recommended_action == "FOLLOW_UP":
            action = "FOLLOW_UP"
        else:
            action = analysis.recommended_action or "MOVE_TOPIC"

        if action == "FOLLOW_UP" and state.followups_used < 3:
            state.followups_used += 1
            q = await self._followup(state, analysis, context)
        elif action == "ASK_MANDATORY" and state.pending_mandatory:
            q_text = state.pending_mandatory.pop(0)
            q = GeneratedQuestion(question=q_text, competency="mandatory", source="mandatory")
        elif action == "END":
            closing = "Thanks — that covers what I needed. I'll wrap up the interview now."
            state.conversation_history.append({"role": "interviewer", "content": closing})
            state.current_section = "end"
            return state, closing, {"action": "END", "evaluation": evaluation.model_dump(), "analysis": analysis.model_dump()}
        else:
            if action == "INCREASE_DIFFICULTY":
                state.difficulty = _bump(state.difficulty, 1)
            elif action == "DECREASE_DIFFICULTY":
                state.difficulty = _bump(state.difficulty, -1)
            q = await self._generate_question(state, context)

        # Deduplicate: never ask the exact same question twice
        if q.question.strip().lower() == (state.last_question or "").strip().lower():
            q = _heuristic_next_question(state, context, force_different=True)

        guard = await self._guardrail(q.question, context)
        if not guard.allowed:
            q = _heuristic_next_question(state, context, force_different=True)

        state.questions_asked += 1
        state.last_question = q.question
        state.current_competency = q.competency
        state.topics_covered[q.competency] = state.topics_covered.get(q.competency, 0) + 1
        if state.current_section == "introduction":
            state.current_section = "resume"
        elif state.current_section == "resume":
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
                "analysis": analysis.model_dump(),
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

    async def _generate_question(self, state: InterviewState, context: dict[str, Any]) -> GeneratedQuestion:
        # Prefer deterministic resume/JD-grounded questions (works without API keys too).
        heuristic = _heuristic_next_question(state, context)
        system, version = get_prompt("question_generator")
        history = state.conversation_history[-8:]
        try:
            generated = await self.llm.structured_output(
                [
                    {
                        "role": "system",
                        "content": system
                        + " Ground the question in a SPECIFIC resume project, skill, or JD requirement. "
                        "Never repeat a previous question. Reference the candidate's work by name when possible.",
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Generate ONE interview question.\n"
                            f"Difficulty: {state.difficulty}\n"
                            f"Section: {state.current_section}\n"
                            f"Prior turns: {history}\n"
                            f"Already asked count: {state.questions_asked}\n"
                            f"Topics covered: {state.topics_covered}\n"
                            f"Match: {context.get('match')}\n"
                            f"Resume projects: {context.get('resume_projects')}\n"
                            f"Resume skills: {context.get('resume_skills')}\n"
                            f"JD required skills: {context.get('jd_required_skills')}\n"
                            f"Resume claims: {state.plan.get('resume_claims_to_validate') or (context.get('match') or {}).get('claims_to_validate')}\n"
                            f"Suggested grounded question (you may refine): {heuristic.question}"
                        ),
                    },
                ],
                GeneratedQuestion,
                meta={"prompt_name": "question_generator", "prompt_version": version},
            )
            # If model returns a near-duplicate, use heuristic
            if generated.question.strip().lower() == (state.last_question or "").strip().lower():
                return heuristic
            # Reject generic non-grounded repeats of the canned RAG line when we have richer context
            if "rag system" in generated.question.lower() and _resume_project_names(context):
                return heuristic
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
        system, version = get_prompt("report_generator")
        try:
            return await self.llm.structured_output(
                [
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": (
                            f"State:\n{state.model_dump_json()}\n\n"
                            f"Context summary:\n{ {k: context.get(k) for k in ('job_title','match','competencies')} }"
                        ),
                    },
                ],
                ReportDraft,
                meta={"prompt_name": "report_generator", "prompt_version": version},
            )
        except Exception:
            return ReportDraft(
                overall_score=sum(state.competency_scores.values()) / max(len(state.competency_scores), 1)
                if state.competency_scores
                else 0,
                recommendation="insufficient_evidence" if not state.competency_scores else "maybe",
                strengths=list(state.competency_scores.keys())[:3],
                weaknesses=state.flags[:3],
                evidence=[h["content"] for h in state.conversation_history if h["role"] == "candidate"][-3:],
                competency_scores=state.competency_scores,
                recommended_next_step="Human recruiter review required before any hiring decision.",
            )

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
        system, version = get_prompt("guardrail_checker")
        try:
            return await self.llm.structured_output(
                [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Check question:\n{text}\nJob:{context.get('job_title')}"},
                ],
                GuardrailResult,
                meta={"prompt_name": "guardrail_checker", "prompt_version": version},
            )
        except Exception:
            return GuardrailResult(allowed=True, reasons=[])

    async def _classify(self, text: str) -> CandidateIntent:
        lower = text.lower()
        if any(x in lower for x in ["weather", "joke", "football", "movie"]):
            return CandidateIntent(
                intent="OFF_TOPIC",
                reply="Let's stay focused on the interview. We can come back to other questions after we're done.",
            )
        if "repeat" in lower:
            return CandidateIntent(intent="PROCESS_INFORMATION", reply="")
        if any(x in lower for x in ["what do you mean", "clarify", "don't understand"]):
            return CandidateIntent(intent="CLARIFICATION", reply="")
        if any(x in lower for x in ["company", "benefits", "salary", "culture", "policy"]):
            return CandidateIntent(intent="COMPANY_INFORMATION", reply="")
        system, version = get_prompt("candidate_question_handler")
        try:
            return await self.llm.structured_output(
                [
                    {"role": "system", "content": system},
                    {"role": "user", "content": text},
                ],
                CandidateIntent,
                meta={"prompt_name": "candidate_question_handler", "prompt_version": version},
            )
        except Exception:
            return CandidateIntent(intent="UNKNOWN", reply="")

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


def _resume_project_names(context: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for p in context.get("resume_projects") or []:
        if isinstance(p, dict):
            name = p.get("name") or p.get("title")
            if name:
                names.append(str(name))
        elif isinstance(p, str) and p.strip():
            names.append(p.strip())
    for p in (context.get("match") or {}).get("relevant_projects") or []:
        if p and str(p) not in names:
            names.append(str(p))
    # Fall back to scanning resume text for common project cues
    if not names:
        text = context.get("resume_text") or ""
        for line in text.splitlines():
            if any(k in line.lower() for k in ("built ", "created ", "developed ", "project")):
                names.append(line.strip()[:80])
            if len(names) >= 3:
                break
    return names


def _pick_project(context: dict[str, Any], state: InterviewState | None = None) -> str:
    names = _resume_project_names(context)
    if not names:
        claims = (context.get("match") or {}).get("claims_to_validate") or []
        if claims:
            return str(claims[0])[:80]
        return ""
    # Rotate by questions asked
    idx = (state.questions_asked if state else 0) % len(names)
    return names[idx]


def _clarify_with_resume(state: InterviewState, answer: str, context: dict[str, Any]) -> str:
    project = _pick_project(context, state)
    skills = context.get("resume_skills") or (context.get("match") or {}).get("strong_matches") or []
    skill = skills[0] if skills else "your core technical stack"
    if project:
        return (
            f"Good question — let's pick one from your resume. "
            f"Please walk me through {project}: what problem it solved, your role, and the tech you used."
        )
    return (
        f"Sure — let's make it concrete. Looking at your background in {skill}, "
        f"tell me about one recent project you're most proud of and what you personally owned."
    )


def _is_scope_clarification(answer: str) -> bool:
    lower = answer.lower().strip()
    cues = [
        "which project",
        "what project",
        "which one",
        "which experience",
        "which role",
        "what do you want me to",
        "what should i talk",
        "can you be more specific",
        "be more specific",
        "which part",
        "about what",
    ]
    return any(c in lower for c in cues)


def _asks_definition(answer: str) -> bool:
    lower = answer.lower()
    return any(c in lower for c in ["what do you mean", "what does", "define ", "clarify what"])


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

    # Avoid repeating last question text
    for offset in range(len(bank)):
        q = bank[(asked + offset) % len(bank)]
        if q.question.strip().lower() != (state.last_question or "").strip().lower():
            return q
    return bank[0]


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
    if any(c in lower for c in ["i don't know", "i do not know", "no idea", "not sure about that"]) and len(
        lower.split()
    ) < 14:
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
