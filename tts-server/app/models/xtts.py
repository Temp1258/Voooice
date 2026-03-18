"""
XTTS-v2 voice cloning engine.

Uses Coqui TTS XTTS-v2 for high-quality voice cloning from a short
reference audio clip.  All heavy imports are deferred (lazy loading)
so the module can be imported even when the TTS package is not installed.
"""

from __future__ import annotations

import io
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger("voooice.xtts")

# Default model directory – can be overridden via environment variable
_DEFAULT_MODEL_DIR = os.environ.get(
    "XTTS_MODEL_DIR",
    str(Path.home() / ".local" / "share" / "tts" / "tts_models--multilingual--multi-dataset--xtts_v2"),
)


class XTTSv2Engine:
    """Wrapper around Coqui TTS XTTS-v2 for voice-cloned synthesis."""

    def __init__(self, model_dir: Optional[str] = None) -> None:
        self.model_dir = Path(model_dir or _DEFAULT_MODEL_DIR)
        self._tts: object | None = None  # lazy-loaded TTS instance
        self._available: bool | None = None

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def is_available(self) -> bool:
        """Return True if the XTTS-v2 model files are present on disk."""
        if self._available is not None:
            return self._available

        # Check for the key model files that XTTS-v2 requires
        required_files = ["config.json", "model.pth"]
        if self.model_dir.is_dir():
            existing = {f.name for f in self.model_dir.iterdir()}
            self._available = all(f in existing for f in required_files)
        else:
            self._available = False

        if not self._available:
            logger.info("XTTS-v2 model not found at %s", self.model_dir)
        return self._available

    # ------------------------------------------------------------------
    # Lazy model loading
    # ------------------------------------------------------------------

    def _load_model(self) -> None:
        """Import TTS and load the XTTS-v2 checkpoint (lazy)."""
        if self._tts is not None:
            return

        try:
            from TTS.api import TTS  # type: ignore[import-untyped]
        except ImportError as exc:
            raise RuntimeError(
                "The 'TTS' package is required for XTTS-v2 support. "
                "Install it with:  pip install TTS"
            ) from exc

        logger.info("Loading XTTS-v2 model from %s …", self.model_dir)
        self._tts = TTS(model_path=str(self.model_dir), gpu=_gpu_available())
        logger.info("XTTS-v2 model loaded successfully.")

    # ------------------------------------------------------------------
    # Synthesis
    # ------------------------------------------------------------------

    def synthesize(
        self,
        text: str,
        speaker_wav_path: str,
        language: str = "zh",
    ) -> bytes:
        """Synthesize *text* using the voice from *speaker_wav_path*.

        Returns raw WAV bytes.  Raises ``RuntimeError`` if the model is not
        installed or the TTS package is missing.
        """
        if not self.is_available():
            raise RuntimeError(
                "XTTS-v2 model is not installed. Download it first or set "
                "XTTS_MODEL_DIR to the correct path."
            )

        self._load_model()

        # Normalise language code: edge-tts uses "zh-CN", XTTS expects "zh"
        lang_short = language.split("-")[0] if "-" in language else language

        wav_buffer = io.BytesIO()
        # TTS.tts_to_file writes a WAV file; we use an in-memory buffer.
        self._tts.tts_to_file(  # type: ignore[union-attr]
            text=text,
            speaker_wav=speaker_wav_path,
            language=lang_short,
            file_path=wav_buffer,
        )
        wav_buffer.seek(0)
        return wav_buffer.read()


# ----------------------------------------------------------------------
# Utilities
# ----------------------------------------------------------------------


def _gpu_available() -> bool:
    """Check whether a CUDA GPU is available (without importing torch at
    module level)."""
    try:
        import torch  # type: ignore[import-untyped]
        return torch.cuda.is_available()
    except ImportError:
        return False
