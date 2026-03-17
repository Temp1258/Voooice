const express = require('express');
const fetch = require('node-fetch');
const multer = require('multer');
const FormData = require('form-data');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

function getApiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }
  return key;
}

// POST /api/synthesis — proxy to ElevenLabs text-to-speech
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { text, voiceId, language, emotion, speed, stability, similarity } = req.body;

    if (!text || !voiceId) {
      return res.status(400).json({ error: 'text and voiceId are required' });
    }

    const apiKey = getApiKey();

    const body = {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: stability != null ? stability : 0.5,
        similarity_boost: similarity != null ? similarity : 0.75,
        style: emotion != null ? emotion : 0,
        use_speaker_boost: true,
      },
    };

    if (speed != null) {
      body.voice_settings.speed = speed;
    }

    const url = `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`;

    const queryParams = new URLSearchParams();
    if (language) {
      queryParams.set('language_code', language);
    }
    const fullUrl = queryParams.toString() ? `${url}?${queryParams}` : url;

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs TTS error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'ElevenLabs API error',
        details: errorText,
      });
    }

    res.set('Content-Type', 'audio/mpeg');
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Synthesis error:', err);
    if (err.message.includes('ELEVENLABS_API_KEY')) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/voices/clone — proxy to ElevenLabs voice/add
router.post('/voices/clone', authenticateToken, upload.single('audio'), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const apiKey = getApiKey();

    const formData = new FormData();
    formData.append('name', name);
    formData.append('files', req.file.buffer, {
      filename: req.file.originalname || 'audio.wav',
      contentType: req.file.mimetype || 'audio/wav',
    });

    const response = await fetch(`${ELEVENLABS_BASE}/voices/add`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs clone error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'ElevenLabs API error',
        details: errorText,
      });
    }

    const data = await response.json();
    res.json({ voice_id: data.voice_id });
  } catch (err) {
    console.error('Voice clone error:', err);
    if (err.message.includes('ELEVENLABS_API_KEY')) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/voices — list ElevenLabs voices
router.get('/voices', authenticateToken, async (req, res) => {
  try {
    const apiKey = getApiKey();

    const response = await fetch(`${ELEVENLABS_BASE}/voices`, {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs list voices error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'ElevenLabs API error',
        details: errorText,
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('List voices error:', err);
    if (err.message.includes('ELEVENLABS_API_KEY')) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/voices/:id — delete ElevenLabs voice
router.delete('/voices/:id', authenticateToken, async (req, res) => {
  try {
    const apiKey = getApiKey();

    const response = await fetch(`${ELEVENLABS_BASE}/voices/${encodeURIComponent(req.params.id)}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs delete voice error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'ElevenLabs API error',
        details: errorText,
      });
    }

    res.json({ message: 'Voice deleted' });
  } catch (err) {
    console.error('Delete voice error:', err);
    if (err.message.includes('ELEVENLABS_API_KEY')) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
