"""Application settings — secrets from environment only."""
from functools import lru_cache
import os
from typing import List

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    app_name: str = "AI Technical Recruiter"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
    )
    public_api_url: str = "http://127.0.0.1:8001"

    database_url: str = "sqlite+aiosqlite:///./ai_recruiter.db"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "change-me-to-a-long-random-string-at-least-32-chars"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080

    llm_provider: str = "groq"
    llm_api_key: str = ""
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_model: str = "llama-3.3-70b-versatile"
    llm_fallback_model: str = "llama-3.1-8b-instant"

    embedding_provider: str = "local"
    embedding_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 384

    reranker_provider: str = "none"

    stt_provider: str = "groq"
    stt_api_key: str = ""
    stt_model: str = "whisper-large-v3-turbo"
    tts_provider: str = "edge"
    tts_voice: str = "en-US-JennyNeural"

    langsmith_api_key: str = ""
    langsmith_tracing: bool = False
    langsmith_project: str = "ai-technical-recruiter"

    research_enabled: bool = False
    research_provider: str = "none"

    max_upload_mb: int = 15
    upload_dir: str = "./uploads"
    rate_limit_per_minute: int = 60

    demo_email: str = "recruiter@example.com"
    demo_password: str = "demo1234"
    demo_name: str = "Demo Recruiter"
    max_concurrent_interviews: int = 5

    @model_validator(mode="after")
    def fill_keys_from_aliases(self):
        # Allow GROQ_API_KEY / OPENAI_API_KEY as drop-in aliases
        if not self.llm_api_key:
            self.llm_api_key = os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY") or ""
        if not self.stt_api_key:
            self.stt_api_key = self.llm_api_key or os.getenv("GROQ_API_KEY") or ""
        return self

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def use_mock_llm(self) -> bool:
        return not bool(self.llm_api_key)

    @property
    def use_mock_stt(self) -> bool:
        return not bool(self.stt_api_key or self.llm_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
