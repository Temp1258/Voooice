const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

// Ensure marketplace tables exist
function ensureMarketplaceTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_voices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      author_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      preview_url TEXT DEFAULT '',
      price REAL DEFAULT 0,
      currency TEXT DEFAULT 'CNY',
      downloads INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      language TEXT DEFAULT 'zh-CN',
      tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS marketplace_ratings (
      id TEXT PRIMARY KEY,
      voice_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating REAL NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(voice_id, user_id),
      FOREIGN KEY (voice_id) REFERENCES marketplace_voices(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS marketplace_downloads (
      id TEXT PRIMARY KEY,
      voice_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (voice_id) REFERENCES marketplace_voices(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

ensureMarketplaceTables();

// List marketplace voices (public, with optional auth for personalization)
router.get('/marketplace/voices', optionalAuth, (req, res) => {
  try {
    const db = getDb();
    const { search, language, sort, price, page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = "WHERE status = 'active'";
    const params = [];

    if (search) {
      where += ' AND (name LIKE ? OR author_name LIKE ? OR tags LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    if (language) {
      where += ' AND language = ?';
      params.push(language);
    }
    if (price === 'free') {
      where += ' AND price = 0';
    } else if (price === 'paid') {
      where += ' AND price > 0';
    }

    let orderBy = 'ORDER BY downloads DESC';
    if (sort === 'latest') orderBy = 'ORDER BY created_at DESC';
    else if (sort === 'rating') orderBy = 'ORDER BY rating DESC';

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM marketplace_voices ${where}`).get(...params);
    const voices = db.prepare(
      `SELECT * FROM marketplace_voices ${where} ${orderBy} LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit), offset);

    // Parse tags JSON
    const parsed = voices.map(v => ({
      ...v,
      tags: JSON.parse(v.tags || '[]'),
    }));

    res.json({ voices: parsed, total: countRow.total });
  } catch (err) {
    console.error('List marketplace voices error:', err);
    res.status(500).json({ error: 'Failed to list voices' });
  }
});

// Get single voice
router.get('/marketplace/voices/:id', optionalAuth, (req, res) => {
  try {
    const db = getDb();
    const voice = db.prepare('SELECT * FROM marketplace_voices WHERE id = ?').get(req.params.id);
    if (!voice) return res.status(404).json({ error: 'Voice not found' });
    voice.tags = JSON.parse(voice.tags || '[]');
    res.json(voice);
  } catch (err) {
    console.error('Get marketplace voice error:', err);
    res.status(500).json({ error: 'Failed to get voice' });
  }
});

// Publish a voice to marketplace
router.post('/marketplace/voices', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { name, description, price, currency, language, tags, voicePrintId } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const id = 'mv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    db.prepare(`
      INSERT INTO marketplace_voices (id, user_id, name, author_name, description, price, currency, language, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user.id,
      name,
      user.display_name || user.email,
      description || '',
      price || 0,
      currency || 'CNY',
      language || 'zh-CN',
      JSON.stringify(tags || []),
      Date.now()
    );

    res.json({ success: true, voiceId: id });
  } catch (err) {
    console.error('Publish marketplace voice error:', err);
    res.status(500).json({ error: 'Failed to publish voice' });
  }
});

// Download/purchase a voice
router.post('/marketplace/voices/:id/download', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const voice = db.prepare('SELECT * FROM marketplace_voices WHERE id = ?').get(req.params.id);
    if (!voice) return res.status(404).json({ error: 'Voice not found' });

    // Record download
    const dlId = 'dl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    db.prepare('INSERT OR IGNORE INTO marketplace_downloads (id, voice_id, user_id, created_at) VALUES (?, ?, ?, ?)')
      .run(dlId, req.params.id, req.user.id, Date.now());

    // Increment download count
    db.prepare('UPDATE marketplace_voices SET downloads = downloads + 1 WHERE id = ?')
      .run(req.params.id);

    res.json({ success: true, voicePrintId: req.params.id });
  } catch (err) {
    console.error('Download marketplace voice error:', err);
    res.status(500).json({ error: 'Failed to download voice' });
  }
});

// Rate a voice
router.post('/marketplace/voices/:id/rate', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { rating } = req.body;
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });

    const ratingId = 'rt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    db.prepare(`
      INSERT INTO marketplace_ratings (id, voice_id, user_id, rating, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(voice_id, user_id) DO UPDATE SET rating = excluded.rating
    `).run(ratingId, req.params.id, req.user.id, rating, Date.now());

    // Recalculate average rating
    const stats = db.prepare(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM marketplace_ratings WHERE voice_id = ?'
    ).get(req.params.id);

    db.prepare('UPDATE marketplace_voices SET rating = ?, rating_count = ? WHERE id = ?')
      .run(Math.round(stats.avg_rating * 10) / 10, stats.count, req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Rate marketplace voice error:', err);
    res.status(500).json({ error: 'Failed to rate voice' });
  }
});

module.exports = router;
