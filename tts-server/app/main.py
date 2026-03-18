"""
Voooice Local TTS Server
===========================
FastAPI application that exposes voice cloning and text-to-speech synthesis
via a simple REST API.  Uses Edge-TTS (Microsoft Neural TTS) as the primary
engine.
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.models.schemas import EdgeVoiceInfo, HealthResponse
from app.routes import synthesis, voices

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("voooice")

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Voooice Local TTS Server", version="0.2.0")

_default_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

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

# ---------------------------------------------------------------------------
# Rate limiter middleware with bounded store
# ---------------------------------------------------------------------------

_rate_limit_store: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX", "20"))
_RATE_LIMIT_WINDOW = float(os.environ.get("RATE_LIMIT_WINDOW", "60.0"))
_MAX_TRACKED_IPS = 10000


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()

    # Clean old entries for this IP
    _rate_limit_store[client_ip] = [
        t for t in _rate_limit_store[client_ip] if now - t < _RATE_LIMIT_WINDOW
    ]

    if len(_rate_limit_store[client_ip]) >= _RATE_LIMIT_MAX:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please try again later."},
            headers={"Retry-After": str(int(_RATE_LIMIT_WINDOW))},
        )

    _rate_limit_store[client_ip].append(now)

    # Bound the store size to prevent memory exhaustion
    if len(_rate_limit_store) > _MAX_TRACKED_IPS:
        oldest_ips = sorted(_rate_limit_store.keys(), key=lambda ip: min(_rate_limit_store[ip]) if _rate_limit_store[ip] else 0)
        for ip in oldest_ips[:1000]:
            del _rate_limit_store[ip]

    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(_RATE_LIMIT_MAX)
    response.headers["X-RateLimit-Remaining"] = str(
        max(0, _RATE_LIMIT_MAX - len(_rate_limit_store[client_ip]))
    )
    return response


# Register routers
app.include_router(synthesis.router)
app.include_router(voices.router)


# ---------------------------------------------------------------------------
# Health endpoint
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
    except Exception as e:
        logger.error("Failed to list Edge-TTS voices: %s", e)
        return []
