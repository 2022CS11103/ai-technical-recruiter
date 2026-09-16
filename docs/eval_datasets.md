# Evaluation dataset stubs

| Dataset | Goal | Labels |
|---------|------|--------|
| question_relevance | Question grounded in JD/resume | relevant / irrelevant |
| followup_quality | Follow-up targets missing concepts | good / weak |
| answer_evaluation | Rubric fidelity 0-5 | score + evidence present |
| rag_retrieval | Metadata-filtered hit quality | hit / miss / hallucination |
| hallucination | Unsupported company claims | grounded / hallucinated |
| guardrails | Protected attribute / off-topic | blocked / allowed |

Store examples under `tests/eval/` as JSONL in later iterations.
