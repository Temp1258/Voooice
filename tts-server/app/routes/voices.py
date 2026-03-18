"""
Voice management routes -- clone, list, get, and delete voices.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models.schemas import CloneResponse, VoiceInfo

router = APIRouter()
logger = logging.getLogger("voooice.voices")

# ---------------------------------------------------------------------------
# On-disk + in-memory voice store
# ---------------------------------------------------------------------------

DATA_DIR = Path(os.environ.get("VOICE_DATA_DIR", str(Path(__file__).resolve().parent.parent.parent / "data" / "voices")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Max upload size: 10MB
MAX_UPLOAD_SIZE = 10 * 1024 * 1024


@dataclass
class StoredVoice:
    id: str
    name: str
    language: str = "en"
    created_at: str = ""
    duration: Optional[float] = None
    sample_rate: Optional[int] = None
    audio_bytes: bytes = field(default_factory=bytes, repr=False)


# voice_id -> StoredVoice
_voices: dict[str, StoredVoice] = {}


def _load_voices_from_disk() -> None:
    """Load any previously persisted voices on startup."""
    for meta_path in DATA_DIR.glob("*/metadata.json"):
        try:
            meta = json.loads(meta_path.read_text())
            audio_path = meta_path.parent / "audio.wav"
            audio_bytes = audio_path.read_bytes() if audio_path.exists() else b""
            voice = StoredVoice(
                id=meta["id"],
                name=meta["name"],
                language=meta.get("language", "en"),
                created_at=meta.get("created_at", ""),
                duration=meta.get("duration"),
                sample_rate=meta.get("sample_rate"),
                audio_bytes=audio_bytes,
            )
            _voices[voice.id] = voice
            logger.info("Loaded voice from disk: %s (%s)", voice.name, voice.id)
        except Exception as e:
            logger.warning("Failed to load voice from %s: %s", meta_path, e)
            continue


_load_voices_from_disk()


def _save_voice_to_disk(voice: StoredVoice) -> None:
    """Persist a voice's audio and metadata to disk."""
    voice_dir = DATA_DIR / voice.id
    voice_dir.mkdir(parents=True, exist_ok=True)

    (voice_dir / "audio.wav").write_bytes(voice.audio_bytes)
    meta = {
        "id": voice.id,
        "name": voice.name,
        "language": voice.language,
        "created_at": voice.created_at,
        "duration": voice.duration,
        "sample_rate": voice.sample_rate,
    }
    (voice_dir / "metadata.json").write_text(json.dumps(meta, indent=2))


def _remove_voice_from_disk(voice_id: str) -> None:
    """Remove a voice's directory from disk."""
    voice_dir = DATA_DIR / voice_id
    if voice_dir.exists():
        for f in voice_dir.iterdir():
            f.unlink()
        voice_dir.rmdir()


def _extract_basic_features(audio_bytes: bytes) -> tuple[Optional[float], Optional[int]]:
    """Extract duration and sample rate from WAV audio bytes.

    Uses the soundfile library if available for robust parsing,
    falling back to manual WAV header parsing.
    """
    # Try soundfile first (handles extended WAV formats)
    try:
        import io
        import soundfile as sf
        with sf.SoundFile(io.BytesIO(audio_bytes)) as f:
            duration = len(f) / f.samplerate
            return duration, f.samplerate
    except Exception:
        pass

    # Fallback: manual WAV header parsing
    try:
        import struct

        if len(audio_bytes) < 44:
            return None, None

        # Verify RIFF/WAVE header
        if audio_bytes[:4] != b"RIFF" or audio_bytes[8:12] != b"WAVE":
            return None, None

        sample_rate = struct.unpack_from("<I", audio_bytes, 24)[0]
        bits_per_sample = struct.unpack_from("<H", audio_bytes, 34)[0]
        num_channels = struct.unpack_from("<H", audio_bytes, 22)[0]
        data_size = struct.unpack_from("<I", audio_bytes, 40)[0]

        if sample_rate > 0 and bits_per_sample > 0 and num_channels > 0:
            bytes_per_sample = bits_per_sample // 8
            duration = data_size / (sample_rate * num_channels * bytes_per_sample)
            return duration, sample_rate
    except Exception as e:
        logger.warning("WAV header parsing failed: %s", e)

    return None, None


def get_voices_store() -> dict[str, StoredVoice]:
    """Expose the voice store for use by other modules (e.g. synthesis)."""
    return _voices


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/v1/clone", response_model=CloneResponse)
async def clone_voice(
    audio: UploadFile = File(...),
    name: str = Form(..., min_length=1, max_length=100),
) -> CloneResponse:
    """Accept an audio file, store it, and return a new voice ID.

    In a full implementation the audio would be processed to extract a
    speaker embedding that can later be fed into the TTS model.
    """
    audio_bytes = await audio.read()

    # Validate file size
    if len(audio_bytes) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Audio file too large. Maximum size is {MAX_UPLOAD_SIZE // (1024*1024)}MB.",
        )

    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    voice_id = str(uuid.uuid4())

    duration, sample_rate = _extract_basic_features(audio_bytes)

    voice = StoredVoice(
        id=voice_id,
        name=name,
        created_at=datetime.now(timezone.utc).isoformat(),
        duration=duration,
        sample_rate=sample_rate,
        audio_bytes=audio_bytes,
    )
    _voices[voice_id] = voice

    # Persist to disk
    try:
        _save_voice_to_disk(voice)
    except Exception as e:
        # If disk save fails, remove from memory to stay consistent
        _voices.pop(voice_id, None)
        logger.error("Failed to save voice to disk: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save voice")

    logger.info("Voice cloned: %s (%s), duration=%.1fs", name, voice_id, duration or 0)
    return CloneResponse(voice_id=voice_id)


@router.get("/v1/voices", response_model=list[VoiceInfo])
async def list_voices() -> list[VoiceInfo]:
    """List all stored voices with metadata."""
    return [
        VoiceInfo(
            id=v.id,
            name=v.name,
            language=v.language,
            created_at=v.created_at,
            duration=v.duration,
            sample_rate=v.sample_rate,
        )
        for v in _voices.values()
    ]


@router.get("/v1/voices/{voice_id}", response_model=VoiceInfo)
async def get_voice(voice_id: str) -> VoiceInfo:
    """Get a single voice by ID."""
    if voice_id not in _voices:
        raise HTTPException(status_code=404, detail=f"Voice '{voice_id}' not found")
    v = _voices[voice_id]
    return VoiceInfo(
        id=v.id,
        name=v.name,
        language=v.language,
        created_at=v.created_at,
        duration=v.duration,
        sample_rate=v.sample_rate,
    )


@router.delete("/v1/voices/{voice_id}")
async def delete_voice(voice_id: str) -> dict[str, str]:
    """Remove a voice from the store and disk."""
    if voice_id not in _voices:
        raise HTTPException(status_code=404, detail=f"Voice '{voice_id}' not found")

    voice = _voices[voice_id]

    # Remove from disk first, then from memory
    try:
        _remove_voice_from_disk(voice_id)
    except Exception as e:
        logger.error("Failed to remove voice from disk: %s", e)
        raise HTTPException(status_code=500, detail="Failed to delete voice")

    del _voices[voice_id]
    logger.info("Voice deleted: %s (%s)", voice.name, voice_id)
    return {"status": "deleted"}
