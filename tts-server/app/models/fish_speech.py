"""
Fish Speech voice cloning engine.

Fish Speech is an open-source TTS model supporting voice cloning from a
short reference clip.  All heavy imports are deferred (lazy loading) so
the module can be imported safely even when Fish Speech is not installed.
"""

from __future__ import annotations

import io
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger("voooice.fish_speech")

_DEFAULT_MODEL_DIR = os.environ.get(
    "FISH_SPEECH_MODEL_DIR",
    str(Path.home() / ".local" / "share" / "fish-speech"),
)


class FishSpeechEngine:
    """Wrapper around Fish Speech for voice-cloned synthesis."""

    def __init__(self, model_dir: Optional[str] = None) -> None:
        self.model_dir = Path(model_dir or _DEFAULT_MODEL_DIR)
        self._available: bool | None = None
        self._model_loaded: bool = False

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def is_available(self) -> bool:
        """Return True if Fish Speech model files are present on disk."""
        if self._available is not None:
            return self._available

        # Fish Speech stores checkpoints in its model directory
        required_markers = ["config.json"]
        if self.model_dir.is_dir():
            existing = {f.name for f in self.model_dir.iterdir()}
            self._available = any(m in existing for m in required_markers)
        else:
            self._available = False

        if not self._available:
            logger.info("Fish Speech model not found at %s", self.model_dir)
        return self._available

    # ------------------------------------------------------------------
    # Lazy model loading
    # ------------------------------------------------------------------

    def _ensure_loaded(self) -> None:
        """Lazily import and initialise Fish Speech internals."""
        if self._model_loaded:
            return

        try:
            import fish_speech  # type: ignore[import-untyped]  # noqa: F401
        except ImportError as exc:
            raise RuntimeError(
                "The 'fish-speech' package is required for Fish Speech support. "
                "See https://github.com/fishaudio/fish-speech for installation."
            ) from exc

        logger.info("Fish Speech engine ready (model dir: %s).", self.model_dir)
        self._model_loaded = True

    # ------------------------------------------------------------------
    # Synthesis
    # ------------------------------------------------------------------

    def synthesize(
        self,
        text: str,
        speaker_wav_path: str,
        language: str = "zh",
    ) -> bytes:
        """Synthesize *text* cloning the voice from *speaker_wav_path*.

        Returns raw WAV bytes.  Raises ``RuntimeError`` if the model or
        dependencies are missing.
        """
        if not self.is_available():
            raise RuntimeError(
                "Fish Speech model is not installed. Download it first or "
                "set FISH_SPEECH_MODEL_DIR to the correct path."
            )

        self._ensure_loaded()

        try:
            from fish_speech.inference import synthesize as fs_synthesize  # type: ignore[import-untyped]

            wav_buffer = io.BytesIO()
            fs_synthesize(
                text=text,
                reference_audio=speaker_wav_path,
                output=wav_buffer,
                model_dir=str(self.model_dir),
                language=language.split("-")[0] if "-" in language else language,
            )
            wav_buffer.seek(0)
            return wav_buffer.read()
        except ImportError:
            # Fallback: use CLI if the Python API isn't available
            return self._synthesize_via_cli(text, speaker_wav_path, language)

    # ------------------------------------------------------------------
    # CLI fallback
    # ------------------------------------------------------------------

    def _synthesize_via_cli(
        self,
        text: str,
        speaker_wav_path: str,
        language: str,
    ) -> bytes:
        """Run Fish Speech via its command-line interface as a fallback."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            cmd = [
                "python", "-m", "fish_speech.inference",
                "--text", text,
                "--reference-audio", speaker_wav_path,
                "--output", tmp_path,
                "--model-dir", str(self.model_dir),
            ]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            if result.returncode != 0:
                logger.error("Fish Speech CLI failed: %s", result.stderr)
                raise RuntimeError(f"Fish Speech synthesis failed: {result.stderr}")

            return Path(tmp_path).read_bytes()
        finally:
            Path(tmp_path).unlink(missing_ok=True)
