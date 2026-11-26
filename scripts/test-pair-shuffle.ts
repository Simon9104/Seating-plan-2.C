// Tests for pair mode ("Shuffle pairs"): no table repeats within a round,
// locked seats respected, and the randomness is actually uniform.
// Run with: npm run test:pairs

import assert from 'node:assert/strict';
import { assignPairTables, emptyState, pairKey, removeFixedPair, shufflePairs, type SeatingState } from '../server/lib/seating.js';
import { MAX_PAIR_LOG } from '../shared/types.js';

// 30 students S0..S29 sitting in order; pairs (S0,S1), (S2,S3), ... for the
// first `pairCount` tables.
function makeState(pairCount: number): SeatingState {
  const s = emptyState();
  s.names = Array.from({ length: 30 }, (_, i) => 'S' + i);
  s.seats = s.names.slice();
  s.fixedPairs = Array.from({ length: pairCount }, (_, k) => ({ id: k + 1, a: 'S' + 2 * k, b: 'S' + (2 * k + 1) }));
  return s;
}

function apply(s: SeatingState) {
  const r = shufflePairs(s);
  return { state: { ...s, seats: r.seats, history: r.history, pairTables: r.pairTables, pairLog: r.pairLog }, result: r };
}

const tableOf = (s: SeatingState, name: string) => Math.floor(s.seats.indexOf(name) / 2);

function checkTogetherAndComplete(s: SeatingState) {
  (s.fixedPairs || []).forEach((p) => assert.equal(tableOf(s, p.a), tableOf(s, p.b), `${p.a}+${p.b} split up`));
  assert.equal(new Set(s.seats.filter(Boolean)).size, 30, 'every student must have exactly one seat');
}

// Chi-square upper critical value at p = 0.001 (Wilson–Hilferty approximation).
function chiCritical(df: number) {
  const z = 3.09;
  return df * Math.pow(1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df)), 3);
}

function chiSquare(counts: number[]) {
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;
  return counts.reduce((sum, c) => sum + ((c - expected) * (c - expected)) / expected, 0);
}

let passed = 0;
function test(name: string, fn: () => void) {
  const t0 = Date.now();
  fn();
  passed++;
  console.log(`✓ ${name} (${Date.now() - t0} ms)`);
}

// Pair sequence of tables [start, after shuffle 1, 2, ...]: every round of
// `free` consecutive positions (sharing its first table with the previous
// round's last) must contain each free table exactly once.
function assertRounds(sequence: number[], free: number[], label: string) {
  for (let start = 0; start + free.length <= sequence.length; start += free.length - 1) {
    const round = sequence.slice(start, start + free.length);
    assert.deepEqual([...round].sort((a, b) => a - b), free, `${label}: tables repeated within a round: ${round.join(',')}`);
  }
  for (let i = 1; i < sequence.length; i++) assert.notEqual(sequence[i], sequence[i - 1], `${label}: stayed at the same table`);
}

test('15 pairs: every pair sits at every table exactly once per round (200 runs × 3 rounds)', () => {
  const free = Array.from({ length: 15 }, (_, t) => t);
  for (let run = 0; run < 200; run++) {
    let s = makeState(15);
    const seq: number[][] = s.fixedPairs!.map((p) => [tableOf(s, p.a)]);
    for (let k = 0; k < 14 * 3 + 1; k++) {
      const { state, result } = apply(s);
      s = state;
      checkTogetherAndComplete(s);
      // A new round starts for everybody at once, exactly when the last one is done.
      assert.equal(result.newRounds, k > 0 && k % 14 === 0 ? 15 : 0, `run ${run} shuffle ${k}: newRounds`);
      s.fixedPairs!.forEach((p, i) => seq[i].push(tableOf(s, p.a)));
    }
    seq.forEach((sequence, i) => assertRounds(sequence, free, `run ${run} pair ${i}`));
  }
});

test('locked seat: 14 pairs + 1 single + 1 pinned student, no repeats, pin never moves', () => {
  const free = Array.from({ length: 14 }, (_, t) => t);
  for (let run = 0; run < 200; run++) {
    let s = makeState(14);
    s.rules = [{ id: 1, name: 'S28', table: 15, seat: 'A' }];
    const seq: number[][] = s.fixedPairs!.map((p) => [tableOf(s, p.a)]);
    for (let k = 0; k < 13 * 3 + 1; k++) {
      s = apply(s).state;
      checkTogetherAndComplete(s);
      assert.equal(s.seats[28], 'S28', 'pinned student moved');
      assert.equal(s.seats[29], 'S29', 'the only free seat left is next to the pinned student');
      s.fixedPairs!.forEach((p, i) => seq[i].push(tableOf(s, p.a)));
    }
    seq.forEach((sequence, i) => assertRounds(sequence, free, `run ${run} pair ${i}`));
  }
});

test('keep-apart rules and tablemate history are ignored in pair mode', () => {
  const s = makeState(15);
  s.avoidPairs = [{ id: 1, a: 'S0', b: 'S1' }];
  s.pairHistory = { [pairKey('S0', 'S1')]: true };
  const { state, result } = apply(s);
  assert.equal(tableOf(state, 'S0'), tableOf(state, 'S1'), 'pair must stay together despite keep-apart');
  assert.ok(!('pairHistory' in result), 'pair mode must not touch tablemate history');
});

// Every valid assignment of pairs to tables, by brute force.
function enumerate(tableCount: number, allowed: number[][]): string[] {
  const out: string[] = [];
  const walk = (i: number, used: number[]) => {
    if (i === allowed.length) return void out.push(used.join(','));
    allowed[i].forEach((t) => {
      if (used.indexOf(t) === -1) walk(i + 1, used.concat([t]));
    });
  };
  walk(0, []);
  return out;
}

function assertExactlyUniform(tableCount: number, allowed: number[][], samples: number) {
  const all = enumerate(tableCount, allowed);
  const counts = new Map(all.map((k) => [k, 0]));
  for (let i = 0; i < samples; i++) {
    const r = assignPairTables(tableCount, allowed);
    assert.ok(r, 'an assignment exists');
    const key = r.join(',');
    assert.ok(counts.has(key), `invalid assignment ${key}`);
    counts.set(key, counts.get(key)! + 1);
  }
  const values = Array.from(counts.values());
  assert.ok(values.every((v) => v > 0), 'every valid seating must actually come up');
  const chi = chiSquare(values);
  const crit = chiCritical(values.length - 1);
  assert.ok(chi < crit, `not uniform: chi² ${chi.toFixed(1)} ≥ ${crit.toFixed(1)}`);
  return { combos: values.length, chi, crit, min: Math.min(...values), max: Math.max(...values) };
}

test('exact uniformity: 6 pairs × 6 tables with partial history (every valid seating equally likely)', () => {
  const allowed = [
    [1, 2, 3, 4, 5],
    [0, 2, 3, 5],
    [0, 1, 3, 4],
    [0, 1, 2, 4, 5],
    [1, 2, 3, 5],
    [0, 2, 3, 4]
  ];
  const r = assertExactlyUniform(6, allowed, 200_000);
  console.log(`    ${r.combos} valid seatings, each seen ${r.min}–${r.max}×, chi² ${r.chi.toFixed(1)} < ${r.crit.toFixed(1)}`);
});

test('exact uniformity: 3 pairs over 6 tables (fewer pairs than tables)', () => {
  const r = assertExactlyUniform(6, [[0, 1, 2, 3, 4], [1, 2, 3, 4, 5], [0, 2, 4]], 100_000);
  console.log(`    ${r.combos} valid seatings, each seen ${r.min}–${r.max}×, chi² ${r.chi.toFixed(1)} < ${r.crit.toFixed(1)}`);
});

test('impossible constraints are reported, not looped on', () => {
  assert.equal(assignPairTables(3, [[0], [0], [1, 2]]), null);
});

test('15 pairs from a fresh start: each pair lands on each of the 14 other tables equally often', () => {
  const s = makeState(15);
  const samples = 30_000;
  const counts = s.fixedPairs!.map(() => new Array(15).fill(0));
  for (let i = 0; i < samples; i++) {
    const { state } = apply(s);
    s.fixedPairs!.forEach((p, k) => counts[k][tableOf(state, p.a)]++);
  }
  s.fixedPairs!.forEach((p, k) => {
    const own = tableOf(s, p.a);
    assert.equal(counts[k][own], 0, `pair ${k} stayed at its own table`);
    const others = counts[k].filter((_, t) => t !== own);
    const chi = chiSquare(others);
    assert.ok(chi < chiCritical(13), `pair ${k} not uniform: chi² ${chi.toFixed(1)}`);
  });
  const c0 = counts[0].filter((_, t) => t !== 0);
  console.log(`    pair S0+S1 over its 14 tables: ${Math.min(...c0)}–${Math.max(...c0)} (expected ≈ ${(samples / 14).toFixed(0)} each)`);
});

test('A/B order inside a pair is a coin flip', () => {
  const s = makeState(15);
  let s0First = 0;
  const samples = 10_000;
  for (let i = 0; i < samples; i++) if (apply(s).state.seats.indexOf('S0') % 2 === 0) s0First++;
  assert.ok(Math.abs(s0First / samples - 0.5) < 0.02, `S0 got seat A ${s0First}/${samples}`);
});

test('contradictory history (after manual moves) recovers with a valid seating', () => {
  for (let run = 0; run < 200; run++) {
    const s = makeState(15);
    // Pairs 0 and 1 have both been everywhere except table 2 — they can't both get it.
    const everywhereBut2 = Array.from({ length: 15 }, (_, t) => t).filter((t) => t !== 2);
    s.pairTables = { [pairKey('S0', 'S1')]: everywhereBut2, [pairKey('S2', 'S3')]: everywhereBut2 };
    const { state, result } = apply(s);
    checkTogetherAndComplete(state);
    assert.ok(result.newRounds >= 1, 'someone must start a new round');
    s.fixedPairs!.forEach((p) => assert.notEqual(tableOf(state, p.a), tableOf(s, p.a), `${p.a}+${p.b} stayed put`));
  }
});

test('more pairs than free tables: the extra pairs sit as singles, nobody is lost', () => {
  const s = makeState(15);
  s.rules = [{ id: 1, name: 'S0', table: 1, seat: 'A' }, { id: 2, name: 'S5', table: 3, seat: 'B' }];
  for (let i = 0; i < 500; i++) {
    const { state } = apply(s);
    assert.equal(new Set(state.seats.filter(Boolean)).size, 30);
    assert.equal(state.seats[0], 'S0');
    assert.equal(state.seats[5], 'S5');
  }
});

test('pair history log: one entry per shuffle with the new table, capped, removed with the pair', () => {
  let s = makeState(15);
  for (let k = 1; k <= 20; k++) {
    s = apply(s).state;
    s.fixedPairs!.forEach((p) => {
      const log = s.pairLog![pairKey(p.a, p.b)];
      assert.equal(log.length, k, 'one log entry per shuffle');
      assert.equal(log[log.length - 1].table, tableOf(s, p.a), 'latest entry is the table it now sits at');
    });
  }
  const key = pairKey('S0', 'S1');
  s.pairLog = { ...s.pairLog, [key]: Array.from({ length: MAX_PAIR_LOG }, (_, i) => ({ timestamp: i, table: 0 })) };
  s = apply(s).state;
  assert.equal(s.pairLog![key].length, MAX_PAIR_LOG, 'log is capped');
  assert.equal(s.pairLog![key][0].timestamp, 1, 'oldest entry dropped first');
  const removed = removeFixedPair(s, 1);
  assert.ok(!(key in removed.pairLog) && !(key in removed.pairTables), 'removing a pair drops its history');
  assert.ok(pairKey('S2', 'S3') in removed.pairLog, 'other pairs keep theirs');
});

console.log(`\nAll ${passed} pair-mode tests passed.`);
