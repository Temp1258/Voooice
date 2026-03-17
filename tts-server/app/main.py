"""
Voooice Local TTS Server
===========================
FastAPI application that exposes voice cloning and text-to-speech synthesis
via a simple REST API.  For the MVP the TTS endpoint returns a placeholder
sine-wave WAV; comments throughout indicate where real model inference would
be wired in.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models.schemas import EdgeVoiceInfo, HealthResponse
from app.routes import synthesis, voices

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Voooice Local TTS Server", version="0.1.0")

_default_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

# CORS_ORIGINS env var: comma-separated list of allowed origins.
# Set to "*" to allow all origins (not recommended for production).
_env_origins = os.environ.get("CORS_ORIGINS")
if _env_origins:
    _allowed_origins = [o.strip() for o in _env_origins.split(",") if o.strip()]
else:
    _allowed_origins = _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(synthesis.router)
app.include_router(voices.router)


# ---------------------------------------------------------------------------
# Health endpoint (kept at app level)
# ---------------------------------------------------------------------------

def _gpu_available() -> bool:
    """Check whether a CUDA-capable GPU is available."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


@app.get("/v1/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        models=synthesis.AVAILABLE_MODELS,
        gpu=_gpu_available(),
    )


@app.get("/v1/edge-voices", response_model=list[EdgeVoiceInfo])
async def list_edge_voices() -> list[EdgeVoiceInfo]:
    """List all available Edge-TTS neural voices."""
    try:
        import edge_tts
        voice_list = await edge_tts.list_voices()
        return [
            EdgeVoiceInfo(
                short_name=v["ShortName"],
                friendly_name=v["FriendlyName"],
                locale=v["Locale"],
                gender=v["Gender"],
            )
            for v in voice_list
        ]
    except Exception:
        return []
