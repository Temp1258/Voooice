"""
Pydantic models for the Voooice Local TTS Server API.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    """Request body for the ``POST /v1/tts`` endpoint."""

    text: str
    voice_id: str
    model: str = "auto"
    language: str = "zh-CN"
    emotion: str = "neutral"
    speed: float = 1.0
    stability: float = 0.5
    similarity: float = 0.75


class TTSResponse(BaseModel):
    """Metadata returned alongside (or instead of) the streamed audio."""

    audio_url: Optional[str] = None
    duration: float
    model_used: str


class VoiceInfo(BaseModel):
    """Public representation of a stored voice."""

    id: str
    name: str
    language: str = "en"
    created_at: Optional[str] = None
    duration: Optional[float] = None
    sample_rate: Optional[int] = None
    preview_url: Optional[str] = None


class CloneRequest(BaseModel):
    """Documentation-only schema for the multipart clone endpoint.

    The actual endpoint uses ``File(...)`` and ``Form(...)`` parameters
    rather than a JSON body, but this model is kept for OpenAPI docs.
    """

    audio: str = Field(..., description="Audio file (sent as multipart form upload)")
    name: str = Field(..., description="Human-readable voice name")


class CloneResponse(BaseModel):
    """Response from ``POST /v1/clone``."""

    voice_id: str


class HealthResponse(BaseModel):
    """Response from ``GET /v1/health``."""

    status: str
    models: list[str]
    gpu: bool


class EdgeVoiceInfo(BaseModel):
    """An available Edge-TTS neural voice."""

    short_name: str
    friendly_name: str
    locale: str
    gender: str
