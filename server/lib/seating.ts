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

// Moves every fixed pair, as a unit, to a random table (random A/B order);
// everyone else fills the remaining free seats at random. Locked seats stay.
export function shufflePairs(state: SeatingState): {
  seats: string[];
  pairHistory: Record<string, boolean>;
  history: HistoryEntry[];
  placedPairs: number;
} {
  const lockedIndexes = state.rules.map((r) => slotIndex(r.table, r.seat));
  const lockedNames = state.rules.map((r) => r.name);
  const pairs = activePairs(state);
  const freeTables: number[] = [];
  for (let t = 0; t < TABLE_COUNT; t++) {
    if (lockedIndexes.indexOf(t * 2) === -1 && lockedIndexes.indexOf(t * 2 + 1) === -1) freeTables.push(t);
  }

  // Prefer an arrangement where no pair stays at the table it's at now.
  let best: string[] | null = null;
  let bestStayed = Infinity;
  let placedPairs = 0;
  for (let attempt = 0; attempt < 50 && bestStayed > 0; attempt++) {
    const seats = new Array(SEAT_COUNT).fill('');
    state.rules.forEach((r) => {
      seats[slotIndex(r.table, r.seat)] = r.name;
    });
    const tables = shuffled(freeTables);
    const placed: string[] = [];
    let stayed = 0;
    shuffled(pairs).forEach((p) => {
      const t = tables.shift();
      if (t === undefined) return;
      const [first, second] = Math.random() < 0.5 ? [p.a, p.b] : [p.b, p.a];
      seats[t * 2] = first;
      seats[t * 2 + 1] = second;
      placed.push(p.a, p.b);
      if (Math.floor(state.seats.indexOf(p.a) / 2) === t) stayed++;
    });
    const pool = shuffled(state.names.filter((n) => n && lockedNames.indexOf(n) === -1 && placed.indexOf(n) === -1));
    let p = 0;
    for (let i = 0; i < SEAT_COUNT; i++) {
      if (lockedIndexes.indexOf(i) !== -1 || seats[i]) continue;
      seats[i] = pool[p] || '';
      p++;
    }
    if (stayed < bestStayed) {
      bestStayed = stayed;
      best = seats;
      placedPairs = placed.length / 2;
    }
  }

  const seats = best as string[];
  const pairHistory = { ...state.pairHistory };
  tablematePairs(seats).forEach((key) => {
    pairHistory[key] = true;
  });
  const historyEntry: HistoryEntry = { id: Date.now(), timestamp: Date.now(), seats: seats.slice() };
  const history = [historyEntry, ...state.history].slice(0, MAX_HISTORY);

  return { seats, pairHistory, history, placedPairs };
}

// A student can belong to at most one fixed pair.
export function addFixedPair(state: SeatingState, a: string, b: string): FixedPair[] | null {
  if (!a || !b || a === b) return null;
  const pairs = state.fixedPairs || [];
  const taken = pairs.some((p) => p.a === a || p.b === a || p.a === b || p.b === b);
  if (taken) return null;
  return pairs.concat([{ id: Date.now(), a, b }]);
}

export function removeFixedPair(state: SeatingState, id: number): FixedPair[] {
  return (state.fixedPairs || []).filter((p) => p.id !== id);
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
