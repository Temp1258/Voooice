"""
VocalText Local TTS Server
===========================
A FastAPI application that exposes voice cloning and text-to-speech synthesis
via a simple REST API.  For the MVP the TTS endpoint returns a placeholder
sine-wave WAV; comments throughout indicate where real model inference would
be wired in.
"""

from __future__ import annotations

import io
import math
import struct
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="VocalText Local TTS Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Model manager stubs
# ---------------------------------------------------------------------------

# In a production build each model would be lazily loaded into GPU memory
# the first time it is requested.  The stubs below show the intended
# structure.

AVAILABLE_MODELS: list[str] = ["xtts-v2", "fish-speech", "chattts"]


def _gpu_available() -> bool:
    """Check whether a CUDA-capable GPU is available."""
    try:
        import torch  # noqa: F811
        return torch.cuda.is_available()
    except ImportError:
        return False


class ModelManager:
    """
    Placeholder model manager.

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
# In-memory voice storage
# ---------------------------------------------------------------------------


@dataclass
class StoredVoice:
    id: str
    name: str
    language: str = "en"
    audio_bytes: bytes = field(default_factory=bytes, repr=False)


# voice_id -> StoredVoice
_voices: dict[str, StoredVoice] = {}

# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class TTSRequest(BaseModel):
    text: str
    voice_id: str
    model: str = "xtts-v2"
    language: str = "en"
    emotion: str = "neutral"
    speed: float = 1.0
    stability: float = 0.5
    similarity: float = 0.75


class HealthResponse(BaseModel):
    status: str
    models: list[str]
    gpu: bool


class CloneResponse(BaseModel):
    voice_id: str


class VoiceInfo(BaseModel):
    id: str
    name: str
    language: str
    preview_url: str | None = None


# ---------------------------------------------------------------------------
# Helpers
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

    # Build WAV in memory
    buf = io.BytesIO()
    data_size = num_samples * 2  # 16-bit = 2 bytes per sample
    # RIFF header
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    # fmt chunk
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))  # chunk size
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
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/v1/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        models=AVAILABLE_MODELS,
        gpu=_gpu_available(),
    )


@app.post("/v1/clone", response_model=CloneResponse)
async def clone_voice(
    audio: UploadFile = File(...),
    name: str = Form(...),
) -> CloneResponse:
    """Accept an audio file, store it, and return a new voice ID.

    In a full implementation the audio would be processed to extract a
    speaker embedding that can later be fed into the TTS model.
    """
    audio_bytes = await audio.read()
    voice_id = str(uuid.uuid4())

    # ----- Speaker embedding extraction would go here -----
    # e.g. embedding = encoder.embed_utterance(preprocess_wav(audio_bytes))

    _voices[voice_id] = StoredVoice(
        id=voice_id,
        name=name,
        audio_bytes=audio_bytes,
    )

    return CloneResponse(voice_id=voice_id)


@app.post("/v1/tts")
async def text_to_speech(req: TTSRequest) -> Response:
    """Synthesize speech from text using the specified model and voice.

    For the MVP this returns a simple sine-wave WAV.  The comments below
    show where each model's inference pipeline would be called.
    """
    if req.voice_id not in _voices:
        raise HTTPException(status_code=404, detail=f"Voice '{req.voice_id}' not found")

    if req.model not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown model '{req.model}'")

    # ----- Model inference would go here -----
    #
    # model = model_manager.get_model(req.model)
    # voice = _voices[req.voice_id]
    #
    # if req.model == "xtts-v2":
    #     # XTTS-v2 inference
    #     wav = model.tts(
    #         text=req.text,
    #         speaker_wav=voice.audio_bytes,
    #         language=req.language,
    #         speed=req.speed,
    #     )
    #
    # elif req.model == "fish-speech":
    #     # Fish Speech inference (Chinese-optimised)
    #     wav = model.synthesize(
    #         text=req.text,
    #         speaker_embedding=voice.embedding,
    #         language=req.language,
    #     )
    #
    # elif req.model == "chattts":
    #     # ChatTTS inference (emotion-aware)
    #     wav = model.infer(
    #         text=req.text,
    #         params_infer_code={"spk_emb": voice.embedding},
    #         emotion=req.emotion,
    #     )

    # Placeholder: return a sine wave whose frequency loosely maps to the
    # requested speed so the caller gets a valid WAV back.
    frequency = 440.0 * req.speed
    wav_bytes = _generate_sine_wav(frequency=frequency, duration=2.0)

    return Response(content=wav_bytes, media_type="audio/wav")


@app.get("/v1/voices", response_model=list[VoiceInfo])
async def list_voices() -> list[VoiceInfo]:
    return [
        VoiceInfo(id=v.id, name=v.name, language=v.language)
        for v in _voices.values()
    ]


@app.delete("/v1/voices/{voice_id}")
async def delete_voice(voice_id: str) -> dict[str, str]:
    if voice_id not in _voices:
        raise HTTPException(status_code=404, detail=f"Voice '{voice_id}' not found")
    del _voices[voice_id]
    return {"status": "deleted"}
