import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let _db: Database.Database | null = null;

/**
 * Returns the singleton better-sqlite3 database instance.
 * Opens the database and applies migrations on first call.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.resolve(process.cwd(), 'data', 'wanna-bet.db');
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  _db = new Database(dbPath);

  // Enable WAL mode and foreign keys
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  return _db;
}

/**
 * Closes the database connection. Should be called on graceful shutdown.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
