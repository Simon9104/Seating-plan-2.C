import { createClient, type Client } from '@libsql/client';

// Keep in sync with ./schema.sql and ../../../scripts/setup-admin.mjs
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_username TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  ip TEXT,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time ON login_attempts (username, created_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_username TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE TABLE IF NOT EXISTS seating_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS timetable_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS room_timetable_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS bot_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  ip TEXT,
  country_code TEXT,
  country_name TEXT,
  region TEXT,
  city TEXT,
  latitude REAL,
  longitude REAL,
  user_agent TEXT,
  username TEXT,
  password TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bot_log_created_at ON bot_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_log_country ON bot_log (country_code);
`;

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function assertSafeForEnvironment(url: string) {
  const isLocalFile = url.startsWith('file:');
  const runningOnNetlifyDeploy = process.env.NETLIFY === 'true' && process.env.NETLIFY_DEV !== 'true';
  if (isLocalFile && runningOnNetlifyDeploy) {
    throw new Error(
      'DATABASE_URL is a local "file:" database, which does not persist on Netlify Functions ' +
        '(the filesystem is ephemeral/read-only in production). Set DATABASE_URL and ' +
        'DATABASE_AUTH_TOKEN to a hosted libSQL database (e.g. Turso) in your Netlify site ' +
        'environment variables before deploying. See README.md.'
    );
  }
}

export function getDb(): Client {
  if (client) return client;
  const url = process.env.DATABASE_URL || 'file:local.db';
  assertSafeForEnvironment(url);
  client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined
  });
  return client;
}

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = getDb();
    const statements = SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean);
    schemaReady = (async () => {
      for (const stmt of statements) {
        await db.execute(stmt);
      }
    })();
  }
  return schemaReady;
}
