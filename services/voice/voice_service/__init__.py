"""Voice provider abstractions + implementations."""
from __future__ import annotations

import io
from abc import ABC, abstractmethod
from typing import Optional


class STTProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
        raise NotImplementedError


class TTSProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str, voice: Optional[str] = None) -> bytes:
        raise NotImplementedError


class MockSTT(STTProvider):
    async def transcribe(self, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
        # Dev fallback: frontend should send text; this returns placeholder.
        return "[voice transcription unavailable — use text fallback]"


class GroqSTT(STTProvider):
    def __init__(self, api_key: str, model: str = "whisper-large-v3-turbo") -> None:
        self.api_key = api_key
        self.model = model

    async def transcribe(self, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
        from groq import AsyncGroq

        client = AsyncGroq(api_key=self.api_key)
        file_obj = io.BytesIO(audio_bytes)
        file_obj.name = "audio.webm"
        result = await client.audio.transcriptions.create(
            file=file_obj,
            model=self.model,
        )
        return getattr(result, "text", str(result))


class EdgeTTSProvider(TTSProvider):
    def __init__(self, voice: str = "en-US-JennyNeural") -> None:
        self.voice = voice

    async def synthesize(self, text: str, voice: Optional[str] = None) -> bytes:
        import edge_tts

        communicate = edge_tts.Communicate(text, voice or self.voice)
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()


class MockTTS(TTSProvider):
    async def synthesize(self, text: str, voice: Optional[str] = None) -> bytes:
        # Return empty audio; UI will show text
        return b""


def build_stt(provider: str, api_key: str, model: str) -> STTProvider:
    if provider == "groq" and api_key:
        return GroqSTT(api_key=api_key, model=model)
    return MockSTT()


def build_tts(provider: str, voice: str) -> TTSProvider:
    if provider == "edge":
        try:
            return EdgeTTSProvider(voice=voice)
        except Exception:
            return MockTTS()
    return MockTTS()
