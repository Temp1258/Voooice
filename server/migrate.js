#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const db = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Ensure the _migrations tracking table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at TEXT NOT NULL
  );
`);

/**
 * Get list of SQL migration files sorted by name.
 */
function getMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

/**
 * Get set of already-applied migration names.
 */
function getAppliedMigrations() {
  const rows = db.prepare('SELECT name FROM _migrations ORDER BY id').all();
  return new Set(rows.map(r => r.name));
}

/**
 * Show the status of all migrations.
 */
function showStatus() {
  const files = getMigrationFiles();
  const applied = getAppliedMigrations();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  console.log('\nMigration Status');
  console.log('─'.repeat(60));

  const appliedRows = db.prepare('SELECT name, applied_at FROM _migrations ORDER BY id').all();
  const appliedMap = new Map(appliedRows.map(r => [r.name, r.applied_at]));

  for (const file of files) {
    const status = applied.has(file) ? 'applied' : 'pending';
    const timestamp = appliedMap.get(file) || '';
    const icon = status === 'applied' ? '[x]' : '[ ]';
    const info = timestamp ? `  (${timestamp})` : '';
    console.log(`  ${icon} ${file}${info}`);
  }

  console.log('─'.repeat(60));
  const pendingCount = files.filter(f => !applied.has(f)).length;
  console.log(`  ${files.length} total, ${files.length - pendingCount} applied, ${pendingCount} pending\n`);
}

/**
 * Run all pending migrations in order.
 */
function runMigrations() {
  const files = getMigrationFiles();
  const applied = getAppliedMigrations();

  const pending = files.filter(f => !applied.has(f));

  if (pending.length === 0) {
    console.log('All migrations are up to date.');
    return;
  }

  console.log(`\nRunning ${pending.length} pending migration(s)...\n`);

  const insertStmt = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');

  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    const migrate = db.transaction(() => {
      db.exec(sql);
      insertStmt.run(file, new Date().toISOString());
    });

    try {
      migrate();
      console.log(`  Applied: ${file}`);
    } catch (err) {
      console.error(`  FAILED:  ${file}`);
      console.error(`           ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\nAll migrations applied successfully.\n');
}

// --- CLI entry point ---

const args = process.argv.slice(2);

if (args.includes('--status')) {
  showStatus();
} else {
  runMigrations();
}
