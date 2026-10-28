import type { RequestContext } from './lib/request-context.js';
import type { Client } from '@libsql/client';
import { ensureSchema, getDb } from './lib/db.js';
import {
  createSession,
  destroySession,
  findAdmin,
  hashPassword,
  isLockedOut,
  isPasswordStrong,
  isValidUsername,
  recordLoginAttempt,
  validateSession,
  verifyAgainstDummy,
  verifyPassword,
  csrfMatches,
  countAdmins,
  SESSION_TTL_SECONDS
} from './lib/auth.js';
import { logAction, listAuditLog } from './lib/audit.js';
import { botLogCountrySummary, botLogTotalCount, listBotLog } from './lib/bot-log.js';
import {
  addAvoidPair,
  addFixedPair,
  addRule,
  emptyState,
  removeAvoidPair,
  removeFixedPair,
  removeRule,
  rotateSeats,
  sanitizeNames,
  shuffle,
  shufflePairs,
  swapSeats,
  type SeatingState
} from './lib/seating.js';
import {
  defaultRoomTimetableState,
  defaultTimetableState,
  newlyHomeSlots,
  sanitizeEarlyPeriod,
  sanitizeGrid,
  sanitizeGroupsGrid,
  sanitizeHomeGrid,
  sanitizePeriods,
  sanitizeRoomGrid,
  sanitizeSplitGrid,
  sanitizeSubjectTeachers
} from './lib/timetable.js';
import { loadSingletonState, updateSingletonState } from './lib/singleton-state.js';
import type { RoomTimetableState, TimetableState } from '../shared/types.js';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  clientIp,
  isSameOriginRequest,
  json,
  noContent,
  parseCookies,
  SESSION_COOKIE
} from './lib/http.js';

async function loadState(db: Client) {
  return loadSingletonState(db, 'seating_state', emptyState);
}
async function updateState(db: Client, adminUsername: string, mutator: (s: SeatingState) => SeatingState) {
  return updateSingletonState(db, 'seating_state', adminUsername, emptyState, mutator);
}

async function loadTimetable(db: Client) {
  return loadSingletonState(db, 'timetable_state', defaultTimetableState);
}
async function updateTimetable(db: Client, adminUsername: string, mutator: (s: TimetableState) => TimetableState) {
  return updateSingletonState(db, 'timetable_state', adminUsername, defaultTimetableState, mutator);
}

async function loadRoomTimetable(db: Client) {
  return loadSingletonState(db, 'room_timetable_state', defaultRoomTimetableState);
}
async function updateRoomTimetable(db: Client, adminUsername: string, mutator: (s: RoomTimetableState) => RoomTimetableState) {
  return updateSingletonState(db, 'room_timetable_state', adminUsername, defaultRoomTimetableState, mutator);
}

const TIMETABLE_FIELD_LABELS: Record<string, string> = {
  periods: 'periods',
  grid: 'subjects',
  splitGrid: 'split periods',
  groupsGrid: 'groups',
  earlyPeriod: 'early period',
  homeGrid: 'home room',
  subjectTeachers: 'subjects & teachers'
};

interface AuthedRequest {
  adminUsername: string;
  token: string;
  csrfToken: string;
}

async function requireAuth(req: Request, db: Client): Promise<AuthedRequest | Response> {
  const cookies = parseCookies(req.headers.get('cookie'));
  const token = cookies[SESSION_COOKIE];
  const session = await validateSession(db, token);
  if (!session || !token) {
    return json(401, { error: 'Not signed in.' });
  }
  if (req.method !== 'GET') {
    if (!isSameOriginRequest(req)) {
      return json(403, { error: 'Cross-origin request blocked.' });
    }
    const provided = req.headers.get('x-csrf-token');
    if (!csrfMatches(session.csrfToken, provided)) {
      return json(403, { error: 'Missing or invalid CSRF token.' });
    }
  }
  return { adminUsername: session.adminUsername, token, csrfToken: session.csrfToken };
}

function isResponse(x: unknown): x is Response {
  return x instanceof Response;
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function publicSeatingView(state: SeatingState) {
  return {
    seats: state.seats,
    labelStyle: state.labelStyle,
    deskAccent: state.deskAccent
  };
}

function adminStateView(state: SeatingState) {
  return state;
}

export default async (req: Request, context: RequestContext): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = req.method;
  const ip = clientIp(req, context);
  const userAgent = req.headers.get('user-agent') || '';

  await ensureSchema();
  const db = getDb();

  try {
    // ---- Public ----
    if (path === '/seating' && method === 'GET') {
      const { state } = await loadState(db);
      return json(200, publicSeatingView(state));
    }

    if (path === '/timetable' && method === 'GET') {
      const { state } = await loadTimetable(db);
      return json(200, state);
    }

    if (path === '/room-timetable' && method === 'GET') {
      const { state } = await loadRoomTimetable(db);
      return json(200, state);
    }

    // ---- Auth ----
    if (path === '/auth/login' && method === 'POST') {
      // Blocks login-CSRF (a page elsewhere silently submitting an
      // attacker's credentials so a victim ends up authenticated as them).
      if (!isSameOriginRequest(req)) return json(403, { error: 'Cross-origin request blocked.' });
      const body = await readJson<{ username?: string; password?: string }>(req);
      const username = (body?.username || '').trim();
      const password = body?.password || '';
      if (!username || !password) return json(400, { error: 'Username and password are required.' });

      if (await isLockedOut(db, username, ip)) {
        await logAction(db, username, 'login_locked_out', 'Too many failed attempts', ip);
        return json(429, { error: 'Too many failed attempts. Try again in 15 minutes.' });
      }

      const admin = await findAdmin(db, username);
      const valid = admin ? await verifyPassword(password, admin.password_hash) : await verifyAgainstDummy(password).then(() => false);
      await recordLoginAttempt(db, username, ip, valid);
      if (!valid || !admin) {
        await logAction(db, username, 'login_failed', null, ip);
        return json(401, { error: 'Invalid username or password.' });
      }

      const session = await createSession(db, admin.username, ip, userAgent);
      await logAction(db, admin.username, 'login', null, ip);
      return json(
        200,
        { admin: { username: admin.username, displayName: admin.display_name }, csrfToken: session.csrfToken },
        { 'Set-Cookie': buildSessionCookie(session.token, SESSION_TTL_SECONDS) }
      );
    }

    if (path === '/auth/logout' && method === 'POST') {
      if (!isSameOriginRequest(req)) return json(403, { error: 'Cross-origin request blocked.' });
      const cookies = parseCookies(req.headers.get('cookie'));
      const token = cookies[SESSION_COOKIE];
      const session = token ? await validateSession(db, token) : null;
      if (token) await destroySession(db, token);
      if (session) await logAction(db, session.adminUsername, 'logout', null, ip);
      return json(200, { ok: true }, { 'Set-Cookie': buildClearSessionCookie() });
    }

    if (path === '/auth/me' && method === 'GET') {
      const cookies = parseCookies(req.headers.get('cookie'));
      const token = cookies[SESSION_COOKIE];
      const session = await validateSession(db, token);
      if (!session) return json(401, { error: 'Not signed in.' });
      const admin = await findAdmin(db, session.adminUsername);
      if (!admin) return json(401, { error: 'Not signed in.' });
      return json(200, {
        admin: { username: admin.username, displayName: admin.display_name },
        csrfToken: session.csrfToken
      });
    }

    // ---- Admin (all require auth) ----
    if (path.startsWith('/admin/')) {
      const auth = await requireAuth(req, db);
      if (isResponse(auth)) return auth;
      const { adminUsername } = auth;

      if (path === '/admin/state' && method === 'GET') {
        const { state } = await loadState(db);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/roster/lock' && method === 'POST') {
        const body = await readJson<{ names?: string[] }>(req);
        let willLock = false;
        const state = await updateState(db, adminUsername, (s) => {
          willLock = !s.rosterLocked;
          // Names are only ever written here, as one batch, when locking —
          // never per-keystroke — so an admin's typing is never raced
          // against a slower in-flight save.
          const names = willLock && Array.isArray(body?.names) ? sanitizeNames(body.names) : s.names;
          return { ...s, names, rosterLocked: willLock };
        });
        await logAction(
          db,
          adminUsername,
          state.rosterLocked ? 'roster_locked' : 'roster_unlocked',
          state.rosterLocked ? `${state.names.filter(Boolean).length} names saved` : null,
          ip
        );
        return json(200, adminStateView(state));
      }

      if (path === '/admin/shuffle' && method === 'POST') {
        let violated = false;
        const state = await updateState(db, adminUsername, (s) => {
          const result = shuffle(s);
          violated = result.hadViolations;
          return { ...s, seats: result.seats, pairHistory: result.pairHistory, history: result.history };
        });
        await logAction(db, adminUsername, 'shuffle', violated ? 'Some repeat tablemates were unavoidable' : 'No repeat tablemates', ip);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/shuffle-pairs' && method === 'POST') {
        let placed = 0;
        const state = await updateState(db, adminUsername, (s) => {
          const result = shufflePairs(s);
          placed = result.placedPairs;
          return { ...s, seats: result.seats, pairHistory: result.pairHistory, history: result.history };
        });
        await logAction(db, adminUsername, 'shuffle_pairs', `${placed} pair${placed === 1 ? '' : 's'} moved together`, ip);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/fixed-pairs' && method === 'POST') {
        const body = await readJson<{ a?: string; b?: string }>(req);
        const a = (body?.a || '').trim();
        const b = (body?.b || '').trim();
        if (!a || !b || a === b) return json(400, { error: 'Two different students are required.' });
        let rejected = false;
        const state = await updateState(db, adminUsername, (s) => {
          if (s.names.indexOf(a) === -1 || s.names.indexOf(b) === -1) {
            rejected = true;
            return s;
          }
          const next = addFixedPair(s, a, b);
          rejected = !next;
          return next ? { ...s, fixedPairs: next } : s;
        });
        if (rejected) return json(400, { error: 'Each student can only be in one pair.' });
        await logAction(db, adminUsername, 'add_fixed_pair', `${a} + ${b}`, ip);
        return json(200, adminStateView(state));
      }

      const fixedPairDeleteMatch = path.match(/^\/admin\/fixed-pairs\/(\d+)$/);
      if (fixedPairDeleteMatch && method === 'DELETE') {
        const id = Number(fixedPairDeleteMatch[1]);
        let label = '';
        const state = await updateState(db, adminUsername, (s) => {
          const pair = (s.fixedPairs || []).find((p) => p.id === id);
          if (pair) label = `${pair.a} + ${pair.b}`;
          return { ...s, fixedPairs: removeFixedPair(s, id) };
        });
        await logAction(db, adminUsername, 'remove_fixed_pair', label || `pair ${id}`, ip);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/rotate' && method === 'POST') {
        const state = await updateState(db, adminUsername, (s) => ({ ...s, seats: rotateSeats(s) }));
        await logAction(db, adminUsername, 'rotate_seats', null, ip);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/clear-history' && method === 'POST') {
        const state = await updateState(db, adminUsername, (s) => ({ ...s, pairHistory: {}, history: [] }));
        await logAction(db, adminUsername, 'clear_history', null, ip);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/default/save' && method === 'POST') {
        const state = await updateState(db, adminUsername, (s) => ({ ...s, defaultSeats: s.seats.slice() }));
        await logAction(db, adminUsername, 'save_default', null, ip);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/default/reset' && method === 'POST') {
        const state = await updateState(db, adminUsername, (s) => (s.defaultSeats ? { ...s, seats: s.defaultSeats.slice() } : s));
        await logAction(db, adminUsername, 'reset_default', null, ip);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/rules' && method === 'POST') {
        const body = await readJson<{ name?: string; table?: number; seat?: string }>(req);
        const name = (body?.name || '').trim();
        const table = Number(body?.table);
        const seat = body?.seat === 'B' ? 'B' : 'A';
        if (!name || !Number.isInteger(table) || table < 1 || table > 15) {
          return json(400, { error: 'A student name and valid table are required.' });
        }
        const state = await updateState(db, adminUsername, (s) => {
          if (s.names.indexOf(name) === -1) return s;
          const { rules, seats } = addRule(s, name, table, seat);
          return { ...s, rules, seats };
        });
        await logAction(db, adminUsername, 'add_locked_seat', `${name} -> Table ${table}, Seat ${seat}`, ip);
        return json(200, adminStateView(state));
      }

      const ruleDeleteMatch = path.match(/^\/admin\/rules\/(\d+)$/);
      if (ruleDeleteMatch && method === 'DELETE') {
        const id = Number(ruleDeleteMatch[1]);
        let removedName = '';
        const state = await updateState(db, adminUsername, (s) => {
          const rule = s.rules.find((r) => r.id === id);
          removedName = rule?.name || '';
          return { ...s, rules: removeRule(s, id) };
        });
        await logAction(db, adminUsername, 'remove_locked_seat', removedName || `rule ${id}`, ip);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/avoid-pairs' && method === 'POST') {
        const body = await readJson<{ a?: string; b?: string }>(req);
        const a = (body?.a || '').trim();
        const b = (body?.b || '').trim();
        if (!a || !b || a === b) return json(400, { error: 'Two different students are required.' });
        const state = await updateState(db, adminUsername, (s) => {
          const next = addAvoidPair(s, a, b);
          return next ? { ...s, avoidPairs: next } : s;
        });
        await logAction(db, adminUsername, 'add_keep_apart', `${a} <-> ${b}`, ip);
        return json(200, adminStateView(state));
      }

      const pairDeleteMatch = path.match(/^\/admin\/avoid-pairs\/(\d+)$/);
      if (pairDeleteMatch && method === 'DELETE') {
        const id = Number(pairDeleteMatch[1]);
        let label = '';
        const state = await updateState(db, adminUsername, (s) => {
          const pair = s.avoidPairs.find((p) => p.id === id);
          if (pair) label = `${pair.a} <-> ${pair.b}`;
          return { ...s, avoidPairs: removeAvoidPair(s, id) };
        });
        await logAction(db, adminUsername, 'remove_keep_apart', label || `pair ${id}`, ip);
        return json(200, adminStateView(state));
      }

      const historyRestoreMatch = path.match(/^\/admin\/history\/(\d+)\/restore$/);
      if (historyRestoreMatch && method === 'POST') {
        const id = Number(historyRestoreMatch[1]);
        const state = await updateState(db, adminUsername, (s) => {
          const entry = s.history.find((h) => h.id === id);
          return entry ? { ...s, seats: entry.seats.slice() } : s;
        });
        await logAction(db, adminUsername, 'restore_history', `entry ${id}`, ip);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/seats/swap' && method === 'POST') {
        const body = await readJson<{ from?: number; to?: number }>(req);
        const state = await updateState(db, adminUsername, (s) => {
          const seats = swapSeats(s, Number(body?.from), Number(body?.to));
          return seats ? { ...s, seats } : s;
        });
        await logAction(db, adminUsername, 'swap_seats', `${body?.from} <-> ${body?.to}`, ip);
        return json(200, adminStateView(state));
      }

      if (path === '/admin/audit-log' && method === 'GET') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
        const entries = await listAuditLog(db, limit, offset);
        return json(200, { entries });
      }

      if (path === '/admin/bot-log' && method === 'GET') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
        const country = url.searchParams.get('country') || undefined;
        const [entries, total] = await Promise.all([listBotLog(db, limit, offset, country), botLogTotalCount(db)]);
        return json(200, { entries, total });
      }

      if (path === '/admin/bot-log/summary' && method === 'GET') {
        const countries = await botLogCountrySummary(db);
        return json(200, { countries });
      }

      if (path === '/admin/admins' && method === 'GET') {
        const res = await db.execute('SELECT username, display_name, created_at, created_by FROM admins ORDER BY id ASC');
        const admins = res.rows.map((r) => {
          const row = r as unknown as { username: string; display_name: string; created_at: string; created_by: string | null };
          return { username: row.username, displayName: row.display_name, createdAt: row.created_at, createdBy: row.created_by };
        });
        return json(200, { admins });
      }

      if (path === '/admin/admins' && method === 'POST') {
        const body = await readJson<{
          username?: string;
          displayName?: string;
          password?: string;
          currentPassword?: string;
        }>(req);
        const actingAdmin = await findAdmin(db, adminUsername);
        if (!actingAdmin) return json(401, { error: 'Not signed in.' });
        const currentPasswordOk = await verifyPassword(body?.currentPassword || '', actingAdmin.password_hash);
        if (!currentPasswordOk) {
          return json(403, { error: 'Confirm your own password to add a new admin.' });
        }
        const username = (body?.username || '').trim();
        const displayName = (body?.displayName || '').trim().slice(0, 80);
        const password = body?.password || '';
        if (!isValidUsername(username)) {
          return json(400, { error: 'Username must be 3-32 characters: letters, numbers, dot, dash, underscore.' });
        }
        if (!displayName) return json(400, { error: 'Display name is required.' });
        const strength = isPasswordStrong(password, username);
        if (!strength.ok) return json(400, { error: strength.reason });
        const existing = await findAdmin(db, username);
        if (existing) return json(409, { error: 'That username is already taken.' });

        const passwordHash = await hashPassword(password);
        await db.execute({
          sql: 'INSERT INTO admins (username, display_name, password_hash, created_by) VALUES (?, ?, ?, ?)',
          args: [username, displayName, passwordHash, adminUsername]
        });
        await logAction(db, adminUsername, 'create_admin', username, ip);
        return json(201, { ok: true });
      }

      const adminDeleteMatch = path.match(/^\/admin\/admins\/([a-zA-Z0-9._-]{1,32})$/);
      if (adminDeleteMatch && method === 'DELETE') {
        const target = adminDeleteMatch[1];
        if (target === adminUsername) return json(400, { error: 'You cannot remove your own account.' });
        const total = await countAdmins(db);
        if (total <= 1) return json(400, { error: 'At least one admin account must remain.' });
        const existing = await findAdmin(db, target);
        if (!existing) return json(404, { error: 'Admin not found.' });
        await db.execute({ sql: 'DELETE FROM admins WHERE username = ?', args: [target] });
        await logAction(db, adminUsername, 'remove_admin', target, ip);
        return noContent(204);
      }

      if (path === '/admin/timetable' && method === 'POST') {
        const body = await readJson<Partial<TimetableState>>(req);
        if (!body || typeof body !== 'object') return json(400, { error: 'Invalid request body.' });

        const before = (await loadTimetable(db)).state;
        const state = await updateTimetable(db, adminUsername, (s) => {
          const next: TimetableState = { ...s };
          if (body.periods !== undefined) next.periods = sanitizePeriods(body.periods, s.periods);
          if (body.grid !== undefined) next.grid = sanitizeGrid(body.grid, s.grid);
          if (body.splitGrid !== undefined) next.splitGrid = sanitizeSplitGrid(body.splitGrid, s.splitGrid);
          if (body.groupsGrid !== undefined) next.groupsGrid = sanitizeGroupsGrid(body.groupsGrid, s.groupsGrid);
          if (body.earlyPeriod !== undefined) next.earlyPeriod = sanitizeEarlyPeriod(body.earlyPeriod, s.earlyPeriod);
          if (body.homeGrid !== undefined) next.homeGrid = sanitizeHomeGrid(body.homeGrid, s.homeGrid);
          if (body.subjectTeachers !== undefined) next.subjectTeachers = sanitizeSubjectTeachers(body.subjectTeachers, s.subjectTeachers);
          return next;
        });

        // Marking a slot "home class here" should clear any stale room-timetable
        // override for that slot, so the public display falls back to this
        // subject instead of showing a visiting class that's no longer accurate.
        // Only slots that just flipped false -> true are touched, so unrelated
        // room overrides survive a save that didn't change them.
        if (body.homeGrid !== undefined) {
          const slots = newlyHomeSlots(before.homeGrid, state.homeGrid);
          if (slots.length) {
            await updateRoomTimetable(db, adminUsername, (rs) => {
              let touched = false;
              const grid = { ...rs.grid };
              slots.forEach(({ day, index }) => {
                if (grid[day][index]) {
                  touched = true;
                  grid[day] = grid[day].slice();
                  grid[day][index] = '';
                }
              });
              return touched ? { ...rs, grid } : rs;
            });
          }
        }

        const details = Object.keys(body)
          .filter((k) => TIMETABLE_FIELD_LABELS[k])
          .filter((k) => JSON.stringify(before[k as keyof TimetableState]) !== JSON.stringify(state[k as keyof TimetableState]))
          .map((k) => TIMETABLE_FIELD_LABELS[k])
          .join(', ');
        if (details) await logAction(db, adminUsername, 'update_timetable', details, ip);
        return json(200, state);
      }

      if (path === '/admin/timetable/subjects' && method === 'POST') {
        const body = await readJson<{ subject?: string; teacher?: string }>(req);
        const subject = (body?.subject || '').trim().slice(0, 60);
        const teacher = (body?.teacher || '').trim().slice(0, 60);
        if (!subject || !teacher) return json(400, { error: 'Subject and teacher are required.' });
        const state = await updateTimetable(db, adminUsername, (s) => ({
          ...s,
          subjectTeachers: { ...s.subjectTeachers, [subject]: teacher }
        }));
        await logAction(db, adminUsername, 'add_subject', `${subject} (${teacher})`, ip);
        return json(200, state);
      }

      const subjectDeleteMatch = path.match(/^\/admin\/timetable\/subjects\/(.+)$/);
      if (subjectDeleteMatch && method === 'DELETE') {
        const subject = decodeURIComponent(subjectDeleteMatch[1]).slice(0, 60);
        const state = await updateTimetable(db, adminUsername, (s) => {
          if (!(subject in s.subjectTeachers)) return s;
          const subjectTeachers = { ...s.subjectTeachers };
          delete subjectTeachers[subject];
          return { ...s, subjectTeachers };
        });
        await logAction(db, adminUsername, 'remove_subject', subject, ip);
        return json(200, state);
      }

      if (path === '/admin/room-timetable' && method === 'POST') {
        const body = await readJson<Partial<RoomTimetableState>>(req);
        if (!body || typeof body !== 'object') return json(400, { error: 'Invalid request body.' });
        const state = await updateRoomTimetable(db, adminUsername, (s) =>
          body.grid !== undefined ? { ...s, grid: sanitizeRoomGrid(body.grid, s.grid) } : s
        );
        await logAction(db, adminUsername, 'update_room_timetable', null, ip);
        return json(200, state);
      }
    }

    return json(404, { error: 'Not found.' });
  } catch (err) {
    console.error('[api] unhandled error', err);
    return json(500, { error: 'Internal server error.' });
  }
};
