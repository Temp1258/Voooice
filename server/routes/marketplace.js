const express = require('express');
const router = express.Router();
const crypto = require('crypto');
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

    CREATE TABLE IF NOT EXISTS marketplace_purchases (
      id TEXT PRIMARY KEY,
      voice_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(voice_id, user_id),
      FOREIGN KEY (voice_id) REFERENCES marketplace_voices(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_marketplace_voices_status ON marketplace_voices(status);
    CREATE INDEX IF NOT EXISTS idx_marketplace_downloads_voice ON marketplace_downloads(voice_id);
    CREATE INDEX IF NOT EXISTS idx_marketplace_ratings_voice ON marketplace_ratings(voice_id);
  `);
}

ensureMarketplaceTables();

// Safe JSON parse for tags
function parseTags(tagsStr) {
  try {
    return JSON.parse(tagsStr || '[]');
  } catch {
    return [];
  }
}

// List marketplace voices (public, with optional auth for personalization)
router.get('/marketplace/voices', optionalAuth, (req, res) => {
  try {
    const db = getDb();
    const { search, language, sort, price, page = '1', limit = '20' } = req.query;

    // Validate and cap pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

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
    ).all(...params, limitNum, offset);

    const parsed = voices.map(v => ({
      ...v,
      tags: parseTags(v.tags),
    }));

    res.json({ voices: parsed, total: countRow.total, page: pageNum, limit: limitNum });
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
    voice.tags = parseTags(voice.tags);

    // Check if current user has purchased this voice
    let purchased = false;
    if (req.user) {
      const purchase = db.prepare(
        'SELECT id FROM marketplace_purchases WHERE voice_id = ? AND user_id = ?'
      ).get(req.params.id, req.user.id);
      purchased = !!purchase;
    }

    res.json({ ...voice, purchased });
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

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const id = 'mv_' + crypto.randomUUID();

    db.prepare(`
      INSERT INTO marketplace_voices (id, user_id, name, author_name, description, price, currency, language, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user.id,
      name.trim(),
      user.display_name || user.email,
      description || '',
      Math.max(0, parseFloat(price) || 0),
      currency || 'CNY',
      language || 'zh-CN',
      JSON.stringify(Array.isArray(tags) ? tags : []),
      Date.now()
    );

    res.json({ success: true, voiceId: id });
  } catch (err) {
    console.error('Publish marketplace voice error:', err);
    res.status(500).json({ error: 'Failed to publish voice' });
  }
});

// Download/purchase a voice — SECURITY: Enforce purchase for paid voices
router.post('/marketplace/voices/:id/download', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const voice = db.prepare('SELECT * FROM marketplace_voices WHERE id = ?').get(req.params.id);
    if (!voice) return res.status(404).json({ error: 'Voice not found' });

    // Allow download if: free voice, own voice, or already purchased
    if (voice.price > 0 && voice.user_id !== req.user.id) {
      const existing = db.prepare(
        'SELECT id FROM marketplace_purchases WHERE voice_id = ? AND user_id = ?'
      ).get(req.params.id, req.user.id);

      if (!existing) {
        return res.status(402).json({
          error: 'Payment required. Please purchase this voice first.',
          price: voice.price,
          currency: voice.currency,
        });
      }
    }

    // Record download
    const dlId = 'dl_' + crypto.randomUUID();
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

// Purchase a marketplace voice
router.post('/marketplace/voices/:id/purchase', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const voice = db.prepare('SELECT * FROM marketplace_voices WHERE id = ?').get(req.params.id);
    if (!voice) return res.status(404).json({ error: 'Voice not found' });

    if (voice.price <= 0) {
      return res.status(400).json({ error: 'This voice is free, no purchase needed' });
    }

    if (voice.user_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot purchase your own voice' });
    }

    // Check if already purchased
    const existing = db.prepare(
      'SELECT id FROM marketplace_purchases WHERE voice_id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (existing) {
      return res.status(409).json({ error: 'Voice already purchased' });
    }

    const purchaseId = 'pur_' + crypto.randomUUID();
    db.prepare(
      'INSERT INTO marketplace_purchases (id, voice_id, user_id, amount, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(purchaseId, req.params.id, req.user.id, voice.price, Date.now());

    res.json({ success: true, purchaseId });
  } catch (err) {
    console.error('Purchase marketplace voice error:', err);
    res.status(500).json({ error: 'Failed to purchase voice' });
  }
});

// Rate a voice — uses transaction for atomic rating update
router.post('/marketplace/voices/:id/rate', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { rating } = req.body;

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be a number between 1 and 5' });
    }

    const rateTx = db.transaction(() => {
      const ratingId = 'rt_' + crypto.randomUUID();
      db.prepare(`
        INSERT INTO marketplace_ratings (id, voice_id, user_id, rating, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(voice_id, user_id) DO UPDATE SET rating = excluded.rating
      `).run(ratingId, req.params.id, req.user.id, rating, Date.now());

      const stats = db.prepare(
        'SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM marketplace_ratings WHERE voice_id = ?'
      ).get(req.params.id);

      db.prepare('UPDATE marketplace_voices SET rating = ?, rating_count = ? WHERE id = ?')
        .run(Math.round(stats.avg_rating * 10) / 10, stats.count, req.params.id);
    });

    rateTx();

    res.json({ success: true });
  } catch (err) {
    console.error('Rate marketplace voice error:', err);
    res.status(500).json({ error: 'Failed to rate voice' });
  }
});

module.exports = router;
