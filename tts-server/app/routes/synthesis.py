"""
Speech synthesis route -- text-to-speech with model auto-selection.
"""

from __future__ import annotations

import io
import math
import struct
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models.schemas import TTSRequest
from app.routes.voices import get_voices_store

router = APIRouter()

# ---------------------------------------------------------------------------
# Available models & auto-selection logic
# ---------------------------------------------------------------------------

AVAILABLE_MODELS: list[str] = ["xtts-v2", "fish-speech", "chattts"]


def select_model(req: TTSRequest) -> str:
    """Pick the best model based on language and emotion.

    - If emotion is anything other than "neutral", use ChatTTS (best for
      expressive / emotional speech).
    - If the language starts with "zh" (Chinese), use Fish Speech.
    - Otherwise default to XTTS-v2 (multilingual).
    """
    if req.emotion != "neutral":
        return "chattts"
    if req.language.startswith("zh"):
        return "fish-speech"
    return "xtts-v2"


# ---------------------------------------------------------------------------
# Model manager stub
# ---------------------------------------------------------------------------


class ModelManager:
    """Placeholder model manager.

    In a full implementation this class would:
    - Lazily load model weights the first time ``get_model`` is called.
    - Keep an LRU cache of loaded models so that switching between models
      does not trigger repeated disk I/O.
    - Provide a ``synthesize(model_name, text, voice_embedding, **kwargs)``
      method that delegates to the correct backend.
    """

    def __init__(self) -> None:
        self._loaded: dict[str, Any] = {}

    def get_model(self, name: str) -> Any:
        if name not in AVAILABLE_MODELS:
            raise ValueError(f"Unknown model: {name}")
        if name not in self._loaded:
            # ----- XTTS-v2 loading would go here -----
            # from TTS.api import TTS
            # self._loaded[name] = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")

            # ----- Fish Speech loading would go here -----
            # import fish_speech
            # self._loaded[name] = fish_speech.load(...)

            # ----- ChatTTS loading would go here -----
            # import ChatTTS
            # self._loaded[name] = ChatTTS.Chat(); self._loaded[name].load()

            self._loaded[name] = None  # placeholder
        return self._loaded[name]


model_manager = ModelManager()

# ---------------------------------------------------------------------------
# Placeholder audio generator
# ---------------------------------------------------------------------------


def _generate_sine_wav(
    frequency: float = 440.0,
    duration: float = 1.0,
    sample_rate: int = 22050,
) -> bytes:
    """Generate a simple mono 16-bit PCM WAV containing a sine wave.

    This is used as placeholder audio until real model inference is wired up.
    """
    num_samples = int(sample_rate * duration)
    samples: list[int] = []
    for i in range(num_samples):
        value = math.sin(2.0 * math.pi * frequency * i / sample_rate)
        samples.append(int(value * 32767))

    buf = io.BytesIO()
    data_size = num_samples * 2  # 16-bit = 2 bytes per sample
    # RIFF header
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    # fmt chunk
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))
    buf.write(struct.pack("<H", 1))  # PCM
    buf.write(struct.pack("<H", 1))  # mono
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", sample_rate * 2))  # byte rate
    buf.write(struct.pack("<H", 2))  # block align
    buf.write(struct.pack("<H", 16))  # bits per sample
    # data chunk
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
    """Synthesize speech from text using the specified model and voice.

    For the MVP this returns a simple sine-wave WAV.  The comments below
    show where each model's inference pipeline would be called.
    """
    voices = get_voices_store()

    if req.voice_id not in voices:
        raise HTTPException(status_code=404, detail=f"Voice '{req.voice_id}' not found")

    # Resolve model
    model_name = req.model if req.model != "auto" else select_model(req)

    if model_name not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown model '{model_name}'")

    # Load the speaker embedding from the voice store
    voice = voices[req.voice_id]

    # ----- Model inference would go here -----
    #
    # model = model_manager.get_model(model_name)
    #
    # if model_name == "xtts-v2":
    #     # XTTS-v2 inference -- best for multilingual
    #     wav = model.tts(
    #         text=req.text,
    #         speaker_wav=voice.audio_bytes,
    #         language=req.language,
    #         speed=req.speed,
    #     )
    #
    # elif model_name == "fish-speech":
    #     # Fish Speech inference -- optimised for Chinese
    #     wav = model.synthesize(
    #         text=req.text,
    #         speaker_embedding=voice.embedding,
    #         language=req.language,
    #     )
    #
    # elif model_name == "chattts":
    #     # ChatTTS inference -- emotion-aware conversational TTS
    #     wav = model.infer(
    #         text=req.text,
    #         params_infer_code={"spk_emb": voice.embedding},
    #         emotion=req.emotion,
    #     )

    # Placeholder: generate a sine wave whose duration is roughly proportional
    # to the text length (approx 0.15s per character, clamped to 1-30s).
    duration = max(1.0, min(30.0, len(req.text) * 0.15))
    frequency = 440.0 * req.speed
    wav_bytes = _generate_sine_wav(frequency=frequency, duration=duration)

    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={"X-Model-Used": model_name},
    )
