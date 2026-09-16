# Operations notes

## Migrations

In development, the API creates tables on startup (`Base.metadata.create_all`) and enables `pgvector`.

For production, use Alembic:

```bash
cd apps/api
alembic revision --autogenerate -m "init"
alembic upgrade head
```

## Observability

- Structured logs via `structlog`
- Optional LangSmith (`LANGSMITH_TRACING=true`)
- Local `llm_traces` table for prompt/model/latency metadata

## Evaluation datasets

See `docs/eval_datasets.md` for stubs covering question relevance, follow-ups, scoring, RAG, hallucination, and guardrails.
