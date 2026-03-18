"""
Speech synthesis route -- text-to-speech via Edge-TTS with voice cloning
reference support.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
from typing import Any

import edge_tts
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models import engine_manager
from app.models.schemas import TTSRequest
from app.routes.voices import get_voices_store

router = APIRouter()
logger = logging.getLogger("voooice.synthesis")

# Concurrency limiter: configurable max simultaneous Edge-TTS requests
_max_concurrent = int(os.environ.get("TTS_MAX_CONCURRENT", "5"))
_tts_semaphore = asyncio.Semaphore(_max_concurrent)

# ---------------------------------------------------------------------------
# Available models & Edge-TTS voice mapping
# ---------------------------------------------------------------------------

# Dynamically populated from engine_manager at import time and refreshed
# on every /v1/tts call so newly-installed models are picked up.
AVAILABLE_MODELS: list[str] = engine_manager.get_available_models()

# Edge-TTS voice mapping by language and gender/style
EDGE_VOICES: dict[str, dict[str, str]] = {
    "zh-CN": {
        "neutral": "zh-CN-XiaoxiaoNeural",
        "happy": "zh-CN-XiaoyiNeural",
        "sad": "zh-CN-XiaoxiaoNeural",
        "angry": "zh-CN-YunxiNeural",
        "excited": "zh-CN-XiaoyiNeural",
        "calm": "zh-CN-XiaoxiaoNeural",
    },
    "en-US": {
        "neutral": "en-US-JennyNeural",
        "happy": "en-US-AriaNeural",
        "sad": "en-US-JennyNeural",
        "angry": "en-US-GuyNeural",
        "excited": "en-US-AriaNeural",
        "calm": "en-US-JennyNeural",
    },
    "ja-JP": {
        "neutral": "ja-JP-NanamiNeural",
        "happy": "ja-JP-NanamiNeural",
        "sad": "ja-JP-NanamiNeural",
        "angry": "ja-JP-KeitaNeural",
        "excited": "ja-JP-NanamiNeural",
        "calm": "ja-JP-NanamiNeural",
    },
    "ko-KR": {
        "neutral": "ko-KR-SunHiNeural",
        "happy": "ko-KR-SunHiNeural",
        "sad": "ko-KR-SunHiNeural",
        "angry": "ko-KR-InJoonNeural",
        "excited": "ko-KR-SunHiNeural",
        "calm": "ko-KR-SunHiNeural",
    },
}


def _get_edge_voice(language: str, emotion: str) -> str:
    """Pick the best Edge-TTS neural voice for a given language + emotion."""
    lang_voices = EDGE_VOICES.get(language)
    if not lang_voices:
        # Fallback: try prefix match (e.g. "zh" -> "zh-CN")
        prefix = language.split("-")[0]
        for key, voices in EDGE_VOICES.items():
            if key.startswith(prefix):
                lang_voices = voices
                break
    if not lang_voices:
        lang_voices = EDGE_VOICES["zh-CN"]

    return lang_voices.get(emotion, lang_voices["neutral"])


def _speed_to_rate_str(speed: float) -> str:
    """Convert speed multiplier (0.25-4.0) to Edge-TTS rate string like '+20%'.

    Speed is already validated by Pydantic to be between 0.25 and 4.0.
    """
    percent = int((speed - 1.0) * 100)
    if percent >= 0:
        return f"+{percent}%"
    return f"{percent}%"


# ---------------------------------------------------------------------------
# Edge-TTS synthesis
# ---------------------------------------------------------------------------


async def _synthesize_with_edge_tts(
    text: str,
    voice: str,
    rate: str = "+0%",
) -> bytes:
    """Synthesize text using Edge-TTS and return MP3 bytes.

    Uses a semaphore to limit concurrent requests to Microsoft's service.
    """
    async with _tts_semaphore:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        return audio_data


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/v1/tts")
async def text_to_speech(req: TTSRequest) -> StreamingResponse:
    """Synthesize speech from text.

    Supports multiple TTS backends via *engine_manager*.  When the
    requested model is ``"auto"`` or unavailable the server falls back to
    ``edge-tts``.
    """
    voices = get_voices_store()

    if req.voice_id not in voices:
        raise HTTPException(status_code=404, detail=f"Voice '{req.voice_id}' not found")

    voice = voices[req.voice_id]

    # Resolve model — default / fallback to edge-tts
    available = engine_manager.get_available_models()
    model_name = req.model if req.model != "auto" else "edge-tts"

    if model_name != "edge-tts" and model_name not in available:
        logger.warning(
            "Requested model '%s' is not available, falling back to edge-tts.",
            model_name,
        )
        model_name = "edge-tts"

    # Refresh the module-level list so /v1/health stays accurate
    global AVAILABLE_MODELS
    AVAILABLE_MODELS = available

    # ----- edge-tts (async) path -----
    if model_name == "edge-tts":
        return await _handle_edge_tts(req)

    # ----- open-source model (sync) path -----
    return await _handle_open_source_model(req, model_name, voice)


# ---------------------------------------------------------------------------
# Per-engine handler helpers
# ---------------------------------------------------------------------------


async def _handle_edge_tts(req: TTSRequest) -> StreamingResponse:
    """Synthesize via Edge-TTS and return a streaming MP3 response."""
    try:
        edge_voice = _get_edge_voice(req.language, req.emotion)
        rate = _speed_to_rate_str(req.speed)

        audio_bytes = await _synthesize_with_edge_tts(
            text=req.text,
            voice=edge_voice,
            rate=rate,
        )

        if not audio_bytes:
            raise HTTPException(
                status_code=502,
                detail="TTS engine returned empty audio. Please try again.",
            )

        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={
                "X-Model-Used": "edge-tts",
                "X-Voice-Used": edge_voice,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Edge-TTS synthesis failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail="TTS synthesis failed. Please try again later.",
        )


async def _handle_open_source_model(
    req: TTSRequest,
    model_name: str,
    voice: Any,
) -> StreamingResponse:
    """Synthesize via an open-source model (xtts-v2, fish-speech, chattts).

    The actual synthesis is CPU/GPU-bound so it is run in a thread pool
    to avoid blocking the event loop.  On failure the server falls back
    to edge-tts automatically.
    """
    speaker_wav: str | None = getattr(voice, "file_path", None)

    try:
        loop = asyncio.get_running_loop()
        audio_bytes: bytes = await loop.run_in_executor(
            None,
            lambda: engine_manager.synthesize(
                model_name=model_name,
                text=req.text,
                speaker_wav_path=speaker_wav,
                language=req.language,
            ),
        )

        if not audio_bytes:
            raise RuntimeError("Engine returned empty audio.")

        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/wav",
            headers={
                "X-Model-Used": model_name,
            },
        )
    except Exception as e:
        logger.warning(
            "%s synthesis failed (%s), falling back to edge-tts.", model_name, e,
        )
        return await _handle_edge_tts(req)
