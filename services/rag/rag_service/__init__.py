"""RAG: chunking, embeddings, retrieval with metadata filters."""
from __future__ import annotations

import hashlib
import math
import re
from abc import ABC, abstractmethod
from typing import Any, Optional


class EmbeddingProvider(ABC):
    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError


class LocalHashEmbedding(EmbeddingProvider):
    """Deterministic embedding for local/dev without API keys."""

    def __init__(self, dim: int = 384) -> None:
        self.dim = dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for text in texts:
            vec = [0.0] * self.dim
            tokens = re.findall(r"[a-z0-9]+", text.lower())
            if not tokens:
                out.append(vec)
                continue
            for tok in tokens:
                h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
                idx = h % self.dim
                sign = 1.0 if (h // self.dim) % 2 == 0 else -1.0
                vec[idx] += sign
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / norm for v in vec])
        return out


class OpenAICompatibleEmbedding(EmbeddingProvider):
    def __init__(self, api_key: str, base_url: str, model: str, dim: int = 384) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.dim = dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        import httpx

        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/embeddings",
                headers=headers,
                json={"model": self.model, "input": texts},
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            vectors = [row["embedding"] for row in sorted(data, key=lambda r: r["index"])]
            # truncate/pad to configured dim if needed
            fixed = []
            for v in vectors:
                if len(v) >= self.dim:
                    fixed.append(v[: self.dim])
                else:
                    fixed.append(v + [0.0] * (self.dim - len(v)))
            return fixed


class RerankerProvider(ABC):
    @abstractmethod
    async def rerank(self, query: str, documents: list[str], top_k: int = 5) -> list[int]:
        raise NotImplementedError


class NoOpReranker(RerankerProvider):
    async def rerank(self, query: str, documents: list[str], top_k: int = 5) -> list[int]:
        return list(range(min(top_k, len(documents))))


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 120) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = max(0, end - overlap)
    return chunks


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def build_embedding_provider(provider: str, api_key: str, model: str, dim: int, base_url: str = "") -> EmbeddingProvider:
    if provider == "openai" and api_key:
        return OpenAICompatibleEmbedding(api_key=api_key, base_url=base_url or "https://api.openai.com/v1", model=model, dim=dim)
    return LocalHashEmbedding(dim=dim)
