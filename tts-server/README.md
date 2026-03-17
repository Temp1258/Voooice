# VocalText Local TTS Server

A self-hosted TTS server that provides voice cloning and speech synthesis through a REST API.

## Setup

```bash
cd tts-server
pip install -r requirements.txt
```

## Run

```bash
python run.py
```

Or directly with uvicorn:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The server will be available at `http://localhost:8000`. Verify it is running by visiting `http://localhost:8000/v1/health`.

## Docker

```bash
docker build -t vocaltext-tts .
docker run -p 8000:8000 vocaltext-tts
```

For GPU support, use `--gpus all`:

```bash
docker run --gpus all -p 8000:8000 vocaltext-tts
```

## Project Structure

```
tts-server/
  app/
    main.py            # FastAPI app, CORS, health endpoint
    models/
      schemas.py       # Pydantic request/response models
    routes/
      synthesis.py     # POST /v1/tts endpoint
      voices.py        # Clone, list, get, delete voices
  data/voices/         # On-disk voice storage
  run.py               # Entry point
  requirements.txt
```

## Adding Models

The server supports three TTS backends:

1. **XTTS-v2** -- General-purpose multilingual TTS. Install via `pip install TTS`.
2. **Fish Speech** -- Optimised for Chinese. See [fish-speech](https://github.com/fishaudio/fish-speech) for setup.
3. **ChatTTS** -- Emotion-aware conversational TTS. See [ChatTTS](https://github.com/2noise/ChatTTS) for setup.

After installing a model's dependencies, uncomment the corresponding loading and inference sections in `app/routes/synthesis.py`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/health` | Server health check |
| POST | `/v1/clone` | Clone a voice from audio |
| POST | `/v1/tts` | Synthesize speech |
| GET | `/v1/voices` | List stored voices |
| GET | `/v1/voices/{id}` | Get a single voice |
| DELETE | `/v1/voices/{id}` | Delete a voice |
