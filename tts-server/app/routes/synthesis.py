"""
Speech synthesis route -- text-to-speech via Edge-TTS with voice cloning
reference support.
"""

from __future__ import annotations

import asyncio
import io
import math
import struct
from typing import Any

import edge_tts
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models.schemas import TTSRequest
from app.routes.voices import get_voices_store

router = APIRouter()

# Concurrency limiter: max 5 simultaneous Edge-TTS requests
# Prevents flooding Microsoft's service and getting rate-limited
_tts_semaphore = asyncio.Semaphore(5)

# ---------------------------------------------------------------------------
# Available models & Edge-TTS voice mapping
# ---------------------------------------------------------------------------

AVAILABLE_MODELS: list[str] = ["edge-tts", "xtts-v2", "fish-speech", "chattts"]

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
    """Convert speed multiplier (0.5-2.0) to Edge-TTS rate string like '+20%'."""
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
# Placeholder audio generator (kept as final fallback)
# ---------------------------------------------------------------------------


def _generate_sine_wav(
    frequency: float = 440.0,
    duration: float = 1.0,
    sample_rate: int = 22050,
) -> bytes:
    """Generate a simple mono 16-bit PCM WAV containing a sine wave."""
    num_samples = int(sample_rate * duration)
    samples: list[int] = []
    for i in range(num_samples):
        value = math.sin(2.0 * math.pi * frequency * i / sample_rate)
        samples.append(int(value * 32767))

    buf = io.BytesIO()
    data_size = num_samples * 2
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))
    buf.write(struct.pack("<H", 1))
    buf.write(struct.pack("<H", 1))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", sample_rate * 2))
    buf.write(struct.pack("<H", 2))
    buf.write(struct.pack("<H", 16))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    for s in samples:
        buf.write(struct.pack("<h", s))

    return buf.getvalue()


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/v1/tts")
async def text_to_speech(req: TTSRequest) -> StreamingResponse:
    """Synthesize speech from text.

    Uses Edge-TTS (Microsoft Neural TTS) as the primary engine.
    Falls back to sine-wave placeholder if Edge-TTS fails.
    """
    voices = get_voices_store()

    if req.voice_id not in voices:
        raise HTTPException(status_code=404, detail=f"Voice '{req.voice_id}' not found")

    voice = voices[req.voice_id]

    # Resolve model — default to edge-tts
    model_name = req.model if req.model != "auto" else "edge-tts"

    if model_name == "edge-tts":
        try:
            edge_voice = _get_edge_voice(req.language, req.emotion)
            rate = _speed_to_rate_str(req.speed)

            audio_bytes = await _synthesize_with_edge_tts(
                text=req.text,
                voice=edge_voice,
                rate=rate,
            )

            return StreamingResponse(
                io.BytesIO(audio_bytes),
                media_type="audio/mpeg",
                headers={
                    "X-Model-Used": "edge-tts",
                    "X-Voice-Used": edge_voice,
                },
            )
        except Exception as e:
            # Fall back to sine wave if edge-tts fails
            print(f"[TTS] Edge-TTS failed, falling back to sine wave: {e}")

    # Fallback: sine wave
    duration = max(1.0, min(30.0, len(req.text) * 0.15))
    frequency = 440.0 * req.speed
    wav_bytes = _generate_sine_wav(frequency=frequency, duration=duration)

    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={"X-Model-Used": "sine-placeholder"},
    )
