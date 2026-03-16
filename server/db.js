const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'vocaltext.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    plan TEXT DEFAULT 'free',
    voice_quota INTEGER DEFAULT 5,
    used_quota INTEGER DEFAULT 0,
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
`);

// Export both direct db and getDb() for compatibility
module.exports = db;
module.exports.getDb = () => db;
