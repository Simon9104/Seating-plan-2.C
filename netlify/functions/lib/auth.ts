import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Client } from '@libsql/client';

export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const LOGIN_ATTEMPT_WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;
const BCRYPT_COST = 12;

// A real bcrypt hash of a password nobody will ever guess — compared against
// on "user not found" so that response timing doesn't leak whether a
// username exists.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeOmVkFm9wKAF5W9J8T7v8x1lJvzq0m7Uy';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function verifyAgainstDummy(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}

export function isPasswordStrong(password: string, username: string): { ok: boolean; reason?: string } {
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

export function isValidUsername(username: string): boolean {
  return typeof username === 'string' && /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

export interface AdminRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  created_at: string;
  created_by: string | null;
}

export async function findAdmin(db: Client, username: string): Promise<AdminRow | null> {
  const res = await db.execute({
    sql: 'SELECT * FROM admins WHERE username = ?',
    args: [username]
  });
  return (res.rows[0] as unknown as AdminRow) || null;
}

export async function countAdmins(db: Client): Promise<number> {
  const res = await db.execute('SELECT COUNT(*) as c FROM admins');
  return Number((res.rows[0] as unknown as { c: number }).c);
}

export async function isLockedOut(db: Client, username: string, ip: string): Promise<boolean> {
  const res = await db.execute({
    sql: `SELECT COUNT(*) as c FROM login_attempts
          WHERE (username = ? OR ip = ?) AND success = 0
            AND created_at > datetime('now', ?)`,
    args: [username, ip, `-${LOGIN_ATTEMPT_WINDOW_MINUTES} minutes`]
  });
  const count = Number((res.rows[0] as unknown as { c: number }).c);
  return count >= MAX_FAILED_ATTEMPTS;
}

export async function recordLoginAttempt(db: Client, username: string, ip: string, success: boolean): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)',
    args: [username, ip, success ? 1 : 0]
  });
  // Opportunistically prune old attempts so this table doesn't grow forever.
  await db.execute({
    sql: `DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')`,
    args: []
  });
}

export async function createSession(
  db: Client,
  username: string,
  ip: string,
  userAgent: string
): Promise<{ token: string; csrfToken: string; expiresAt: string }> {
  const token = randomToken(32);
  const csrfToken = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.execute({
    sql: `INSERT INTO sessions (token_hash, admin_username, csrf_token, expires_at, ip, user_agent)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [hashToken(token), username, csrfToken, expiresAt, ip, userAgent]
  });
  await db.execute({ sql: `DELETE FROM sessions WHERE expires_at < datetime('now')`, args: [] });
  return { token, csrfToken, expiresAt };
}

export interface SessionInfo {
  adminUsername: string;
  csrfToken: string;
}

export async function validateSession(db: Client, token: string | undefined): Promise<SessionInfo | null> {
  if (!token) return null;
  const res = await db.execute({
    sql: `SELECT admin_username, csrf_token FROM sessions
          WHERE token_hash = ? AND expires_at > datetime('now')`,
    args: [hashToken(token)]
  });
  const row = res.rows[0] as unknown as { admin_username: string; csrf_token: string } | undefined;
  if (!row) return null;
  return { adminUsername: row.admin_username, csrfToken: row.csrf_token };
}

export async function destroySession(db: Client, token: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [hashToken(token)] });
}

export function csrfMatches(expected: string, provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
