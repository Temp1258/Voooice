"""
Unified TTS engine manager.

Manages all supported TTS engines (edge-tts, xtts-v2, fish-speech, chattts)
and provides a single interface for synthesis regardless of backend.
"""

from __future__ import annotations

import io
import logging
import os
from typing import Any

import edge_tts

from app.models.fish_speech import FishSpeechEngine
from app.models.xtts import XTTSv2Engine

logger = logging.getLogger("voooice.engine_manager")

# ---------------------------------------------------------------------------
# ChatTTS stub (lazy-loaded, optional)
# ---------------------------------------------------------------------------


class _ChatTTSEngine:
    """Minimal wrapper for ChatTTS.  Lazy-loads the library."""

    def __init__(self) -> None:
        self._chat: object | None = None
        self._available: bool | None = None
        self._model_dir = os.environ.get("CHATTTS_MODEL_DIR", "")

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            import ChatTTS  # type: ignore[import-untyped]  # noqa: F401

            self._available = True
        except ImportError:
            self._available = False
            logger.info("ChatTTS not installed – engine disabled.")
        return self._available

    def _load(self) -> None:
        if self._chat is not None:
            return
        import ChatTTS  # type: ignore[import-untyped]

        self._chat = ChatTTS.Chat()
        self._chat.load_models()  # type: ignore[union-attr]
        logger.info("ChatTTS model loaded.")

    def synthesize(
        self,
        text: str,
        speaker_wav_path: str | None = None,
        language: str = "zh",
    ) -> bytes:
        if not self.is_available():
            raise RuntimeError("ChatTTS is not installed.")
        self._load()
        wavs = self._chat.infer([text])  # type: ignore[union-attr]
        # ChatTTS returns a list of numpy arrays; convert the first to WAV bytes
        import numpy as np  # type: ignore[import-untyped]
        import struct
        import wave

        samples = wavs[0]
        if hasattr(samples, "numpy"):
            samples = samples.numpy()
        samples = (samples * 32767).astype(np.int16)

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(samples.tobytes())
        buf.seek(0)
        return buf.read()


# ---------------------------------------------------------------------------
# Singleton engine instances
# ---------------------------------------------------------------------------

_xtts_engine: XTTSv2Engine | None = None
_fish_engine: FishSpeechEngine | None = None
_chattts_engine: _ChatTTSEngine | None = None


def _get_xtts() -> XTTSv2Engine:
    global _xtts_engine
    if _xtts_engine is None:
        _xtts_engine = XTTSv2Engine()
    return _xtts_engine


def _get_fish() -> FishSpeechEngine:
    global _fish_engine
    if _fish_engine is None:
        _fish_engine = FishSpeechEngine()
    return _fish_engine


def _get_chattts() -> _ChatTTSEngine:
    global _chattts_engine
    if _chattts_engine is None:
        _chattts_engine = _ChatTTSEngine()
    return _chattts_engine


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Maps engine name -> getter
_ENGINE_GETTERS: dict[str, Any] = {
    "xtts-v2": _get_xtts,
    "fish-speech": _get_fish,
    "chattts": _get_chattts,
}


def get_available_models() -> list[str]:
    """Return the list of TTS models that are actually usable right now.

    ``edge-tts`` is always available (it only needs internet access).
    Open-source models are listed only when their files / packages exist.
    """
    models: list[str] = ["edge-tts"]

    for name, getter in _ENGINE_GETTERS.items():
        try:
            engine = getter()
            if engine.is_available():
                models.append(name)
        except Exception:
            logger.debug("Engine %s unavailable.", name, exc_info=True)

    return models


def get_engine(model_name: str) -> Any:
    """Return the engine instance for *model_name*.

    Raises ``ValueError`` if the model name is unknown.
    """
    if model_name == "edge-tts":
        return None  # edge-tts is handled inline (async); no engine object
    getter = _ENGINE_GETTERS.get(model_name)
    if getter is None:
        raise ValueError(f"Unknown model: {model_name}")
    return getter()


def synthesize(
    model_name: str,
    text: str,
    speaker_wav_path: str | None = None,
    language: str = "zh-CN",
    **kwargs: Any,
) -> bytes:
    """Unified synchronous synthesis interface for open-source models.

    For ``edge-tts`` callers should use the async path in the synthesis
    route directly.  This function handles xtts-v2, fish-speech, and
    chattts.

    If the requested model is not available, falls back to raising a clear
    error (the route layer handles the edge-tts fallback).
    """
    engine = get_engine(model_name)

    if engine is None:
        raise ValueError(
            "Use the async edge-tts path for edge-tts synthesis."
        )

    if not engine.is_available():
        raise RuntimeError(
            f"Model '{model_name}' is not available. "
            "Ensure model files are downloaded and dependencies installed."
        )

    return engine.synthesize(
        text=text,
        speaker_wav_path=speaker_wav_path or "",
        language=language,
    )
