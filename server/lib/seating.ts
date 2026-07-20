// Seating-arrangement rules ported 1:1 from the original design prototype
// (student-seating-arrangement-plan/project/Seating Plan - Admin.dc.html)
// so behavior stays identical, just moved server-side.

import {
  SEAT_COUNT,
  TABLE_COUNT,
  MAX_HISTORY,
  type Seat,
  type AvoidPair,
  type Rule,
  type HistoryEntry,
  type SeatingState
} from '../../shared/types';

export type { Seat, Rule, AvoidPair, HistoryEntry, SeatingState } from '../../shared/types';
export { SEAT_COUNT, TABLE_COUNT, MAX_HISTORY };

export function emptyState(): SeatingState {
  return {
    names: new Array(SEAT_COUNT).fill(''),
    seats: new Array(SEAT_COUNT).fill(''),
    rules: [],
    avoidPairs: [],
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

// Two full 15-table loops, one per seat column (see original component comment).
const LOOP_B = [1, 27, 21, 15, 9, 3, 29, 23, 17, 11, 5, 25, 19, 13, 7];
const LOOP_A = [0, 6, 12, 18, 24, 2, 8, 14, 20, 26, 4, 10, 16, 22, 28];

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
