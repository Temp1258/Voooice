-- 001_initial_schema.sql
-- Core tables: users, voiceprints, audio_blobs, subscriptions, orders

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  plan TEXT DEFAULT 'free',
  voice_quota INTEGER DEFAULT 5,
  used_quota INTEGER DEFAULT 0 CHECK(used_quota >= 0),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS voiceprints (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  duration REAL,
  average_pitch REAL,
  language TEXT,
  cloud_voice_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audio_blobs (
  voiceprint_id TEXT PRIMARY KEY,
  data BLOB NOT NULL,
  FOREIGN KEY (voiceprint_id) REFERENCES voiceprints(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free',
  started_at INTEGER,
  expires_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'CNY',
  payment_method TEXT,
  payment_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  expires_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_voiceprints_user_id ON voiceprints(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);
