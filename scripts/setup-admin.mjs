#!/usr/bin/env node
// Bootstraps the database schema and creates (or updates) one admin account.
// Run locally against your production database before first deploy:
//   DATABASE_URL=libsql://your-db.turso.io DATABASE_AUTH_TOKEN=... npm run setup:admin
// Or run with no env vars to set up the local dev database interactively.

import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import readline from 'node:readline';

// Keep in sync with netlify/functions/lib/db.ts
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
`;

const ENTER_CODES = new Set([10, 13]); // LF, CR
const EOF_CODE = 4; // Ctrl-D
const INTERRUPT_CODE = 3; // Ctrl-C
const BACKSPACE_CODES = new Set([8, 127]); // BS, DEL

function ask(question, options) {
  const mask = options && options.mask;
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!mask) {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = '';
    const onData = (buf) => {
      const code = buf[0];
      if (ENTER_CODES.has(code) || code === EOF_CODE) {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write('\n');
        rl.close();
        resolve(value);
        return;
      }
      if (code === INTERRUPT_CODE) {
        process.stdout.write('\n');
        process.exit(1);
      }
      if (BACKSPACE_CODES.has(code)) {
        value = value.slice(0, -1);
        return;
      }
      value += buf.toString('utf8');
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

function isPasswordStrong(password, username) {
  if (typeof password !== 'string' || password.length < 12) {
    return { ok: false, reason: 'Password must be at least 12 characters long.' };
  }
  if (password.toLowerCase() === username.toLowerCase()) {
    return { ok: false, reason: 'Password must not be the same as the username.' };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, reason: 'Password must contain at least one letter and one number.' };
  }
  return { ok: true };
}

async function main() {
  const url = process.env.DATABASE_URL || 'file:local.db';
  const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;
  console.log(`Connecting to database: ${url}`);
  const db = createClient({ url, authToken });

  const statements = SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await db.execute(stmt);
  }
  console.log('Schema is up to date.');

  let username = process.env.ADMIN_BOOTSTRAP_USERNAME;
  let displayName = process.env.ADMIN_BOOTSTRAP_NAME;
  let password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!username) username = (await ask('Admin username: ')).trim();
  if (!displayName) displayName = (await ask('Admin display name: ')).trim();
  if (!password) password = await ask('Admin password (input hidden): ', { mask: true });

  if (!isValidUsername(username)) {
    console.error('Username must be 3-32 characters: letters, numbers, dot, dash, underscore.');
    process.exit(1);
  }
  if (!displayName) {
    console.error('Display name is required.');
    process.exit(1);
  }
  const strength = isPasswordStrong(password, username);
  if (!strength.ok) {
    console.error(strength.reason);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await db.execute({ sql: 'SELECT id FROM admins WHERE username = ?', args: [username] });
  if (existing.rows.length) {
    await db.execute({
      sql: 'UPDATE admins SET password_hash = ?, display_name = ? WHERE username = ?',
      args: [passwordHash, displayName, username]
    });
    console.log(`Updated existing admin "${username}".`);
  } else {
    await db.execute({
      sql: 'INSERT INTO admins (username, display_name, password_hash, created_by) VALUES (?, ?, ?, ?)',
      args: [username, displayName, passwordHash, 'setup-script']
    });
    console.log(`Created admin "${username}".`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
