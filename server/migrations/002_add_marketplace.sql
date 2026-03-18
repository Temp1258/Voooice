-- 002_add_marketplace.sql
-- Marketplace tables: voices, ratings, downloads, purchases

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

-- Marketplace indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_voices_status ON marketplace_voices(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_voices_user_id ON marketplace_voices(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_downloads_voice ON marketplace_downloads(voice_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_downloads_user ON marketplace_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_ratings_voice ON marketplace_ratings(voice_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_voice ON marketplace_purchases(voice_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_user ON marketplace_purchases(user_id);
