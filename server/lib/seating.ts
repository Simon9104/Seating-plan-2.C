// Seating-arrangement rules ported 1:1 from the original design prototype
// (student-seating-arrangement-plan/project/Seating Plan - Admin.dc.html)
// so behavior stays identical, just moved server-side.

import {
  SEAT_COUNT,
  TABLE_COUNT,
  MAX_HISTORY,
  type Seat,
  type AvoidPair,
  type FixedPair,
  type Rule,
  type HistoryEntry,
  type SeatingState
} from '../../shared/types.js';

export type { Seat, Rule, AvoidPair, FixedPair, HistoryEntry, SeatingState } from '../../shared/types.js';
export { SEAT_COUNT, TABLE_COUNT, MAX_HISTORY };

export function emptyState(): SeatingState {
  return {
    names: new Array(SEAT_COUNT).fill(''),
    seats: new Array(SEAT_COUNT).fill(''),
    rules: [],
    avoidPairs: [],
    fixedPairs: [],
    pairTables: {},
    pairHistory: {},
    history: [],
    defaultSeats: null,
    rosterLocked: false,
    labelStyle: 'numbers',
    deskAccent: '#dbe4f0'
  };
}

export function slotIndex(table: number, seat: Seat): number {
  return (table - 1) * 2 + (seat === 'A' ? 0 : 1);
}

export function pairKey(a: string, b: string): string {
  return a < b ? a + '|' + b : b + '|' + a;
}

export function tablematePairs(seats: string[]): string[] {
  const pairs: string[] = [];
  for (let t = 0; t < TABLE_COUNT; t++) {
    const a = seats[t * 2];
    const b = seats[t * 2 + 1];
    if (a && b) pairs.push(pairKey(a, b));
  }
  return pairs;
}

export function countViolations(seats: string[], avoidPairs: AvoidPair[], pairHistory: Record<string, boolean>): number {
  let count = 0;
  avoidPairs.forEach((pair) => {
    const ai = seats.indexOf(pair.a);
    const bi = seats.indexOf(pair.b);
    if (ai !== -1 && bi !== -1 && Math.floor(ai / 2) === Math.floor(bi / 2)) count += 5;
  });
  tablematePairs(seats).forEach((key) => {
    if (pairHistory[key]) count += 1;
  });
  return count;
}

export function shuffle(state: SeatingState): {
  seats: string[];
  pairHistory: Record<string, boolean>;
  history: HistoryEntry[];
  hadViolations: boolean;
} {
  const rules = state.rules;
  const lockedIndexes = rules.map((r) => slotIndex(r.table, r.seat));
  const lockedNames = rules.map((r) => r.name);
  const baseNames = state.names.filter((n) => n && lockedNames.indexOf(n) === -1);

  let best: string[] | null = null;
  let bestViolations = Infinity;
  const hasConstraints = state.avoidPairs.length > 0 || Object.keys(state.pairHistory).length > 0;
  const attempts = hasConstraints ? 400 : 1;
  for (let attempt = 0; attempt < attempts && bestViolations > 0; attempt++) {
    const pool = baseNames.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    const seats = new Array(SEAT_COUNT).fill('');
    rules.forEach((r) => {
      seats[slotIndex(r.table, r.seat)] = r.name;
    });
    let p = 0;
    for (let i = 0; i < SEAT_COUNT; i++) {
      if (lockedIndexes.indexOf(i) !== -1) continue;
      seats[i] = pool[p] || '';
      p++;
    }
    const violations = countViolations(seats, state.avoidPairs, state.pairHistory);
    if (violations < bestViolations) {
      bestViolations = violations;
      best = seats;
    }
  }

  const seats = best as string[];
  const pairHistory = { ...state.pairHistory };
  tablematePairs(seats).forEach((key) => {
    pairHistory[key] = true;
  });
  const historyEntry: HistoryEntry = { id: Date.now(), timestamp: Date.now(), seats: seats.slice() };
  const history = [historyEntry, ...state.history].slice(0, MAX_HISTORY);

  return { seats, pairHistory, history, hadViolations: bestViolations > 0 };
}

// Two full 15-table loops, one per seat column (see original component comment),
// following the 6/5/4 column layout in TABLE_COLUMNS. Seat A walks down each
// column left to right; seat B starts at table 1, then walks up the middle,
// right and left columns.
const LOOP_A = [0, 6, 12, 18, 24, 28, 2, 8, 14, 20, 26, 4, 10, 16, 22];
const LOOP_B = [1, 27, 21, 15, 9, 3, 23, 17, 11, 5, 29, 25, 19, 13, 7];

function rotateLoop(seats: string[], loop: number[], lockedSet: Record<number, boolean>) {
  const active = loop.filter((idx) => !lockedSet[idx]);
  const n = active.length;
  if (!n) return;
  const vals = active.map((i) => seats[i]);
  active.forEach((i, k) => {
    seats[i] = vals[(k - 1 + n) % n];
  });
}

export function rotateSeats(state: SeatingState): string[] {
  const lockedSet: Record<number, boolean> = {};
  state.rules.forEach((r) => {
    lockedSet[slotIndex(r.table, r.seat)] = true;
  });
  const seats = state.seats.slice();
  rotateLoop(seats, LOOP_A, lockedSet);
  rotateLoop(seats, LOOP_B, lockedSet);
  return seats;
}

function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// Pairs that can actually be placed together right now: both students are on
// the roster and neither is pinned to a fixed seat.
function activePairs(state: SeatingState): FixedPair[] {
  const pinned = state.rules.map((r) => r.name);
  return (state.fixedPairs || []).filter(
    (p) => state.names.indexOf(p.a) !== -1 && state.names.indexOf(p.b) !== -1 && pinned.indexOf(p.a) === -1 && pinned.indexOf(p.b) === -1
  );
}

// Picks a table for every pair so that pair i only ever gets a table in
// allowed[i], and no two pairs share a table. Returns tables[] positions per
// pair, or null if no such assignment exists.
//
// The result is exactly uniform over all valid assignments: count[mask] is the
// number of ways to finish seating pairs popcount(mask)..n-1 when the tables in
// `mask` are already taken, and each step picks a table with probability
// proportional to how many complete assignments it leads to. Tables are at
// most 15, so there are at most 2^15 masks.
export function assignPairTables(tableCount: number, allowed: number[][]): number[] | null {
  const n = allowed.length;
  if (n === 0) return [];
  if (n > tableCount) return null;
  const allowedMask = allowed.map((ts) => ts.reduce((m, t) => m | (1 << t), 0));
  const full = 1 << tableCount;
  const popcount = new Uint8Array(full);
  for (let m = 1; m < full; m++) popcount[m] = popcount[m >> 1] + (m & 1);
  // Supersets have larger values, so filling from the top down means every
  // count[mask | bit] is ready before count[mask] needs it.
  const count = new Float64Array(full);
  for (let mask = full - 1; mask >= 0; mask--) {
    const i = popcount[mask];
    if (i > n) continue;
    if (i === n) {
      count[mask] = 1;
      continue;
    }
    let free = allowedMask[i] & ~mask;
    let total = 0;
    while (free) {
      const bit = free & -free;
      total += count[mask | bit];
      free ^= bit;
    }
    count[mask] = total;
  }
  if (count[0] === 0) return null;

  const result: number[] = [];
  let mask = 0;
  for (let i = 0; i < n; i++) {
    let r = Math.random() * count[mask];
    let pick = -1;
    for (const t of allowed[i]) {
      if (mask & (1 << t)) continue;
      const w = count[mask | (1 << t)];
      if (w === 0) continue;
      pick = t;
      if (r < w) break;
      r -= w;
    }
    result.push(pick);
    mask |= 1 << pick;
  }
  return result;
}

// Pair mode: moves every fixed pair, as a unit, to a random table it hasn't
// sat at yet in the current round (random A/B order). Once a pair has sat at
// every free table, it starts a new round. Keep-apart rules and tablemate
// history are ignored here; locked seats stay where they are. Everyone not in
// a pair fills the remaining free seats at random.
export function shufflePairs(state: SeatingState): {
  seats: string[];
  history: HistoryEntry[];
  pairTables: Record<string, number[]>;
  placedPairs: number;
  newRounds: number;
} {
  const lockedIndexes = state.rules.map((r) => slotIndex(r.table, r.seat));
  const lockedNames = state.rules.map((r) => r.name);
  const freeTables: number[] = [];
  for (let t = 0; t < TABLE_COUNT; t++) {
    if (lockedIndexes.indexOf(t * 2) === -1 && lockedIndexes.indexOf(t * 2 + 1) === -1) freeTables.push(t);
  }
  // More pairs than free tables: a random few have to sit as singles this time.
  const pairs = shuffled(activePairs(state)).slice(0, freeTables.length);
  const oldPairTables = state.pairTables || {};

  // Tables each pair has already used this round, including the one it sits at
  // right now (so a manual swap still counts).
  const currentTable = (p: FixedPair) => {
    const ia = state.seats.indexOf(p.a);
    const ib = state.seats.indexOf(p.b);
    return ia !== -1 && Math.floor(ia / 2) === Math.floor(ib / 2) ? Math.floor(ia / 2) : -1;
  };
  let newRounds = 0;
  const visited = pairs.map((p) => {
    const cur = currentTable(p);
    const seen = new Set((oldPairTables[pairKey(p.a, p.b)] || []).filter((t) => freeTables.indexOf(t) !== -1));
    if (cur !== -1) seen.add(cur);
    if (seen.size >= freeTables.length) {
      newRounds++;
      return cur !== -1 ? new Set([cur]) : new Set<number>();
    }
    return seen;
  });
  const allowedFor = (i: number) => freeTables.map((t, k) => (visited[i].has(t) ? -1 : k)).filter((k) => k !== -1);

  let assignment = assignPairTables(freeTables.length, pairs.map((_, i) => allowedFor(i)));
  // No valid assignment (e.g. after manual moves): restart the round for the
  // most constrained pair and try again, until one exists.
  while (!assignment) {
    const open = pairs.map((_, i) => i).filter((i) => visited[i].size > 1 || (visited[i].size === 1 && currentTable(pairs[i]) === -1));
    if (!open.length) {
      assignment = assignPairTables(freeTables.length, pairs.map(() => freeTables.map((_, k) => k))) as number[];
      break;
    }
    const tightest = Math.max(...open.map((i) => visited[i].size));
    const candidates = shuffled(open.filter((i) => visited[i].size === tightest));
    const i = candidates[0];
    const cur = currentTable(pairs[i]);
    visited[i] = cur !== -1 ? new Set([cur]) : new Set<number>();
    newRounds++;
    assignment = assignPairTables(freeTables.length, pairs.map((_, j) => allowedFor(j)));
  }

  const seats = new Array(SEAT_COUNT).fill('');
  state.rules.forEach((r) => {
    seats[slotIndex(r.table, r.seat)] = r.name;
  });
  const pairTables: Record<string, number[]> = {};
  const placed: string[] = [];
  pairs.forEach((p, i) => {
    const t = freeTables[assignment![i]];
    const [first, second] = Math.random() < 0.5 ? [p.a, p.b] : [p.b, p.a];
    seats[t * 2] = first;
    seats[t * 2 + 1] = second;
    placed.push(p.a, p.b);
    pairTables[pairKey(p.a, p.b)] = Array.from(visited[i]).concat([t]);
  });

  // Singles: random, preferring that nobody keeps their current seat.
  const singles = state.names.filter((n) => n && lockedNames.indexOf(n) === -1 && placed.indexOf(n) === -1);
  const openSeats: number[] = [];
  for (let i = 0; i < SEAT_COUNT; i++) {
    if (lockedIndexes.indexOf(i) === -1 && !seats[i]) openSeats.push(i);
  }
  let bestPool: string[] = [];
  let bestStayed = Infinity;
  for (let attempt = 0; attempt < 100 && bestStayed > 0; attempt++) {
    const pool = shuffled(singles);
    const stayed = openSeats.filter((seat, k) => pool[k] && state.seats[seat] === pool[k]).length;
    if (stayed < bestStayed) {
      bestStayed = stayed;
      bestPool = pool;
    }
  }
  openSeats.forEach((seat, k) => {
    seats[seat] = bestPool[k] || '';
  });

  const historyEntry: HistoryEntry = { id: Date.now(), timestamp: Date.now(), seats: seats.slice() };
  const history = [historyEntry, ...state.history].slice(0, MAX_HISTORY);

  return { seats, history, pairTables, placedPairs: pairs.length, newRounds };
}

// A student can belong to at most one fixed pair.
export function addFixedPair(state: SeatingState, a: string, b: string): FixedPair[] | null {
  if (!a || !b || a === b) return null;
  const pairs = state.fixedPairs || [];
  const taken = pairs.some((p) => p.a === a || p.b === a || p.a === b || p.b === b);
  if (taken) return null;
  return pairs.concat([{ id: Date.now(), a, b }]);
}

export function removeFixedPair(state: SeatingState, id: number): { fixedPairs: FixedPair[]; pairTables: Record<string, number[]> } {
  const pair = (state.fixedPairs || []).find((p) => p.id === id);
  const pairTables = { ...(state.pairTables || {}) };
  if (pair) delete pairTables[pairKey(pair.a, pair.b)];
  return { fixedPairs: (state.fixedPairs || []).filter((p) => p.id !== id), pairTables };
}

export function addRule(state: SeatingState, name: string, table: number, seat: Seat): { rules: Rule[]; seats: string[] } {
  const rules = state.rules.filter((r) => r.name !== name && slotIndex(r.table, r.seat) !== slotIndex(table, seat));
  const newRule: Rule = { id: Date.now(), name, table, seat };
  rules.push(newRule);

  const seats = state.seats.slice();
  const targetIndex = slotIndex(table, seat);
  const existingIndex = seats.indexOf(name);
  if (existingIndex !== -1) seats[existingIndex] = '';
  const displaced = seats[targetIndex];
  seats[targetIndex] = name;
  if (existingIndex !== -1) {
    seats[existingIndex] = displaced;
  } else if (displaced) {
    const emptyIdx = seats.findIndex((s, i) => s === '' && i !== targetIndex);
    if (emptyIdx !== -1) seats[emptyIdx] = displaced;
  }

  return { rules, seats };
}

export function removeRule(state: SeatingState, id: number): Rule[] {
  return state.rules.filter((r) => r.id !== id);
}

export function addAvoidPair(state: SeatingState, a: string, b: string): AvoidPair[] | null {
  if (!a || !b || a === b) return null;
  const exists = state.avoidPairs.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  if (exists) return state.avoidPairs;
  return state.avoidPairs.concat([{ id: Date.now(), a, b }]);
}

export function removeAvoidPair(state: SeatingState, id: number): AvoidPair[] {
  return state.avoidPairs.filter((p) => p.id !== id);
}

export function swapSeats(state: SeatingState, from: number, to: number): string[] | null {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= SEAT_COUNT ||
    to >= SEAT_COUNT ||
    from === to
  ) {
    return null;
  }
  const seats = state.seats.slice();
  const tmp = seats[from];
  seats[from] = seats[to];
  seats[to] = tmp;
  return seats;
}

export function sanitizeNames(names: unknown): string[] {
  const arr = Array.isArray(names) ? names.slice(0, SEAT_COUNT) : [];
  while (arr.length < SEAT_COUNT) arr.push('');
  return arr.map((n) => (typeof n === 'string' ? n.slice(0, 60) : ''));
}
