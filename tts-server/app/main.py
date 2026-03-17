"""
VocalText Local TTS Server
===========================
FastAPI application that exposes voice cloning and text-to-speech synthesis
via a simple REST API.  For the MVP the TTS endpoint returns a placeholder
sine-wave WAV; comments throughout indicate where real model inference would
be wired in.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models.schemas import HealthResponse
from app.routes import synthesis, voices

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="VocalText Local TTS Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
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
