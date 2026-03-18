const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Allowed audio MIME types
const ALLOWED_AUDIO_TYPES = [
  'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/mp3', 'audio/mpeg',
  'audio/ogg', 'audio/webm',
  'audio/mp4', 'audio/m4a', 'audio/x-m4a',
  'audio/aac',
];

// Audio file magic byte signatures for content validation
const AUDIO_MAGIC_BYTES = [
  { prefix: Buffer.from('RIFF'), name: 'WAV' },         // WAV
  { prefix: Buffer.from([0xFF, 0xFB]), name: 'MP3' },   // MP3 (frame sync)
  { prefix: Buffer.from([0xFF, 0xF3]), name: 'MP3' },   // MP3 (frame sync)
  { prefix: Buffer.from([0xFF, 0xF2]), name: 'MP3' },   // MP3 (frame sync)
  { prefix: Buffer.from([0x49, 0x44, 0x33]), name: 'MP3-ID3' }, // MP3 with ID3 tag
  { prefix: Buffer.from('OggS'), name: 'OGG' },         // OGG
  { prefix: Buffer.from([0x1A, 0x45, 0xDF, 0xA3]), name: 'WebM' }, // WebM/Matroska
  { prefix: Buffer.from('ftyp'), offset: 4, name: 'MP4' }, // MP4/M4A (ftyp at offset 4)
  { prefix: Buffer.from('fLaC'), name: 'FLAC' },        // FLAC
];

function validateAudioMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return false;
  for (const sig of AUDIO_MAGIC_BYTES) {
    const offset = sig.offset || 0;
    if (buffer.length >= offset + sig.prefix.length) {
      const slice = buffer.subarray(offset, offset + sig.prefix.length);
      if (slice.equals(sig.prefix)) return true;
    }
  }
  return false;
}

// Configure multer with file type validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max (reduced from 50MB)
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid audio file type: ${file.mimetype}. Allowed: ${ALLOWED_AUDIO_TYPES.join(', ')}`));
    }
  },
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

// POST /api/voiceprints — create voiceprint with atomic quota check
router.post('/voiceprints', authenticateToken, (req, res) => {
  try {
    const { name, duration, averagePitch, language, cloudVoiceId } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const id = uuidv4();
    const created_at = Date.now();

    // Atomic quota check + insert in a transaction to prevent race conditions
    const insertVoiceprint = db.transaction(() => {
      const user = db.prepare('SELECT voice_quota, used_quota FROM users WHERE id = ?').get(req.user.id);
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.used_quota >= user.voice_quota) throw new Error('QUOTA_EXCEEDED');

      db.prepare(
        'INSERT INTO voiceprints (id, user_id, name, duration, average_pitch, language, cloud_voice_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, req.user.id, name.trim(), duration || null, averagePitch || null, language || null, cloudVoiceId || null, created_at);

      db.prepare('UPDATE users SET used_quota = used_quota + 1 WHERE id = ?').run(req.user.id);
    });

    try {
      insertVoiceprint();
    } catch (txErr) {
      if (txErr.message === 'QUOTA_EXCEEDED') {
        return res.status(403).json({ error: 'Voice quota exceeded. Upgrade your plan for more voices.' });
      }
      if (txErr.message === 'USER_NOT_FOUND') {
        return res.status(401).json({ error: 'User not found' });
      }
      throw txErr;
    }

    res.status(201).json({
      voiceprint: {
        id,
        user_id: req.user.id,
        name: name.trim(),
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

// POST /api/audio/:id — upload audio blob with file type validation
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

    // SECURITY: Validate actual file content (magic bytes), not just MIME header
    if (!validateAudioMagicBytes(req.file.buffer)) {
      return res.status(415).json({ error: 'File content does not match a supported audio format' });
    }

    db.prepare(
      'INSERT INTO audio_blobs (voiceprint_id, data) VALUES (?, ?) ON CONFLICT(voiceprint_id) DO UPDATE SET data = excluded.data'
    ).run(req.params.id, req.file.buffer);

    res.json({ message: 'Audio uploaded', size: req.file.size });
  } catch (err) {
    // Handle multer errors
    if (err.message && err.message.startsWith('Invalid audio file type')) {
      return res.status(415).json({ error: err.message });
    }
    console.error('Upload audio error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/audio/:id — download audio blob
router.get('/audio/:id', authenticateToken, (req, res) => {
  try {
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
