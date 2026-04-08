/**
 * Standalone migration script.
 * Run via: npm run db:migrate
 *
 * Reads migrations/001_initial.sql and executes it against the database.
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(process.cwd(), 'data', 'wanna-bet.db');
const migrationPath = path.resolve(process.cwd(), 'migrations', '001_initial.sql');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`Opening database at: ${dbPath}`);
const db = new Database(dbPath);

// Apply the SQL file in exec mode (handles multiple statements)
const sql = fs.readFileSync(migrationPath, 'utf-8');

try {
  db.exec(sql);
  console.log('Migration applied successfully.');

  // Verify tables
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    )
    .all() as Array<{ name: string }>;

  console.log('Tables created:', tables.map((t) => t.name).join(', '));

  // Verify WAL mode
  const journalMode = db.pragma('journal_mode', { simple: true });
  console.log('Journal mode:', journalMode);

  // Verify foreign keys
  const fk = db.pragma('foreign_keys', { simple: true });
  console.log('Foreign keys:', fk);
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
} finally {
  db.close();
}
