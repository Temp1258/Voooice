const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Configure multer to store files in memory as buffers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// GET /api/voiceprints — list user's voiceprints
router.get('/voiceprints', authenticateToken, (req, res) => {
  try {
    const voiceprints = db.prepare(
      'SELECT id, user_id, name, duration, average_pitch, language, cloud_voice_id, created_at FROM voiceprints WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user.id);

    res.json({ voiceprints });
  } catch (err) {
    console.error('List voiceprints error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/voiceprints — create voiceprint metadata
router.post('/voiceprints', authenticateToken, (req, res) => {
  try {
    const { name, duration, averagePitch, language, cloudVoiceId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Check quota
    if (req.user.used_quota >= req.user.voice_quota) {
      return res.status(403).json({ error: 'Voice quota exceeded. Upgrade your plan for more voices.' });
    }

    const id = uuidv4();
    const created_at = Date.now();

    db.prepare(
      'INSERT INTO voiceprints (id, user_id, name, duration, average_pitch, language, cloud_voice_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.user.id, name, duration || null, averagePitch || null, language || null, cloudVoiceId || null, created_at);

    // Increment used quota
    db.prepare('UPDATE users SET used_quota = used_quota + 1 WHERE id = ?').run(req.user.id);

    res.status(201).json({
      voiceprint: {
        id,
        user_id: req.user.id,
        name,
        duration: duration || null,
        average_pitch: averagePitch || null,
        language: language || null,
        cloud_voice_id: cloudVoiceId || null,
        created_at,
      },
    });
  } catch (err) {
    console.error('Create voiceprint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/voiceprints/:id — delete voiceprint + audio
router.delete('/voiceprints/:id', authenticateToken, (req, res) => {
  try {
    const voiceprint = db.prepare(
      'SELECT * FROM voiceprints WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!voiceprint) {
      return res.status(404).json({ error: 'Voiceprint not found' });
    }

    // Delete audio blob first (foreign key), then voiceprint
    const deleteAll = db.transaction(() => {
      db.prepare('DELETE FROM audio_blobs WHERE voiceprint_id = ?').run(req.params.id);
      db.prepare('DELETE FROM voiceprints WHERE id = ?').run(req.params.id);
      db.prepare('UPDATE users SET used_quota = MAX(0, used_quota - 1) WHERE id = ?').run(req.user.id);
    });

    deleteAll();

    res.json({ message: 'Voiceprint deleted' });
  } catch (err) {
    console.error('Delete voiceprint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/audio/:id — upload audio blob
router.post('/audio/:id', authenticateToken, upload.single('audio'), (req, res) => {
  try {
    const voiceprint = db.prepare(
      'SELECT * FROM voiceprints WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!voiceprint) {
      return res.status(404).json({ error: 'Voiceprint not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Upsert audio blob
    db.prepare(
      'INSERT INTO audio_blobs (voiceprint_id, data) VALUES (?, ?) ON CONFLICT(voiceprint_id) DO UPDATE SET data = excluded.data'
    ).run(req.params.id, req.file.buffer);

    res.json({ message: 'Audio uploaded', size: req.file.size });
  } catch (err) {
    console.error('Upload audio error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/audio/:id — download audio blob
router.get('/audio/:id', authenticateToken, (req, res) => {
  try {
    // Verify ownership
    const voiceprint = db.prepare(
      'SELECT * FROM voiceprints WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!voiceprint) {
      return res.status(404).json({ error: 'Voiceprint not found' });
    }

    const audioBlob = db.prepare(
      'SELECT data FROM audio_blobs WHERE voiceprint_id = ?'
    ).get(req.params.id);

    if (!audioBlob) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    res.set('Content-Type', 'audio/wav');
    res.set('Content-Length', audioBlob.data.length);
    res.send(audioBlob.data);
  } catch (err) {
    console.error('Download audio error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
