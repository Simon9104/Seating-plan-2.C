// Weekly timetable + room-timetable logic, ported from the design prototype
// (Timetable - Admin.dc.html / Room Timetable - Admin.dc.html). Every setter
// here sanitizes its input defensively since it's reached from client-
// provided JSON, not just trusted internal calls.

import {
  DAY_KEYS,
  FIXED_TIMES,
  GRID_SLOT_COUNT,
  MAX_SPLIT_GROUPS,
  PERIOD_COUNT,
  type DayKey,
  type EarlyPeriod,
  type Period,
  type RoomTimetableState,
  type TimetableGroup,
  type TimetableState
} from '../../shared/types';

const MAX_TEXT = 60;

function str(v: unknown, max = MAX_TEXT): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function bool(v: unknown): boolean {
  return !!v;
}

function isTime(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

function time(v: unknown, fallback: string): string {
  return isTime(v) ? v : fallback;
}

export function defaultPeriods(): Period[] {
  return FIXED_TIMES.slice(1).map((t) => ({ start: t.start, end: t.end, isBreak: false }));
}

function defaultDayRecord<T>(factory: () => T): Record<DayKey, T> {
  const grid = {} as Record<DayKey, T>;
  DAY_KEYS.forEach((d) => {
    grid[d] = factory();
  });
  return grid;
}

export function defaultGrid(): Record<DayKey, string[]> {
  return defaultDayRecord(() => new Array(PERIOD_COUNT).fill(''));
}

export function defaultSplitGrid(): Record<DayKey, boolean[]> {
  return defaultDayRecord(() => new Array(PERIOD_COUNT).fill(false));
}

export function defaultGroupsGrid(): Record<DayKey, TimetableGroup[][]> {
  return defaultDayRecord(() => new Array(PERIOD_COUNT).fill(null).map(() => []));
}

export function defaultHomeGrid(): Record<DayKey, boolean[]> {
  return defaultDayRecord(() => new Array(GRID_SLOT_COUNT).fill(true));
}

export function defaultEarlyPeriod(): EarlyPeriod {
  return {
    enabled: false,
    groupLabel: '',
    grid: defaultDayRecord(() => ({ start: FIXED_TIMES[0].start, end: FIXED_TIMES[0].end, subject: '' }))
  };
}

export function defaultRoomGrid(): Record<DayKey, string[]> {
  return defaultDayRecord(() => new Array(GRID_SLOT_COUNT).fill(''));
}

export function defaultTimetableState(): TimetableState {
  return {
    periods: defaultPeriods(),
    grid: defaultGrid(),
    splitGrid: defaultSplitGrid(),
    groupsGrid: defaultGroupsGrid(),
    earlyPeriod: defaultEarlyPeriod(),
    homeGrid: defaultHomeGrid(),
    subjectTeachers: {}
  };
}

export function defaultRoomTimetableState(): RoomTimetableState {
  return { grid: defaultRoomGrid() };
}

// ---- Sanitizers: coerce arbitrary client JSON into a well-formed state,
// falling back to the current value for anything malformed. ----

export function sanitizePeriods(input: unknown, current: Period[]): Period[] {
  if (!Array.isArray(input) || input.length !== PERIOD_COUNT) return current;
  return input.map((p, i) => {
    const src = p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
    return {
      start: time(src.start, current[i].start),
      end: time(src.end, current[i].end),
      isBreak: bool(src.isBreak)
    };
  });
}

function sanitizeDayRecord<T>(
  input: unknown,
  current: Record<DayKey, T>,
  sanitizeDay: (value: unknown, currentDay: T) => T
): Record<DayKey, T> {
  if (!input || typeof input !== 'object') return current;
  const src = input as Record<string, unknown>;
  const out = {} as Record<DayKey, T>;
  DAY_KEYS.forEach((d) => {
    out[d] = sanitizeDay(src[d], current[d]);
  });
  return out;
}

export function sanitizeGrid(input: unknown, current: Record<DayKey, string[]>): Record<DayKey, string[]> {
  return sanitizeDayRecord(input, current, (v, cur) => {
    if (!Array.isArray(v) || v.length !== PERIOD_COUNT) return cur;
    return v.map((s) => str(s));
  });
}

export function sanitizeRoomGrid(input: unknown, current: Record<DayKey, string[]>): Record<DayKey, string[]> {
  return sanitizeDayRecord(input, current, (v, cur) => {
    if (!Array.isArray(v) || v.length !== GRID_SLOT_COUNT) return cur;
    return v.map((s) => str(s));
  });
}

export function sanitizeSplitGrid(input: unknown, current: Record<DayKey, boolean[]>): Record<DayKey, boolean[]> {
  return sanitizeDayRecord(input, current, (v, cur) => {
    if (!Array.isArray(v) || v.length !== PERIOD_COUNT) return cur;
    return v.map((b) => bool(b));
  });
}

function sanitizeGroups(input: unknown, current: TimetableGroup[]): TimetableGroup[] {
  if (!Array.isArray(input)) return current;
  return input.slice(0, MAX_SPLIT_GROUPS).map((g, i) => {
    const src = g && typeof g === 'object' ? (g as Record<string, unknown>) : {};
    return {
      label: str(src.label, 10) || String.fromCharCode(65 + i),
      subject: str(src.subject)
    };
  });
}

export function sanitizeGroupsGrid(
  input: unknown,
  current: Record<DayKey, TimetableGroup[][]>
): Record<DayKey, TimetableGroup[][]> {
  return sanitizeDayRecord(input, current, (v, cur) => {
    if (!Array.isArray(v) || v.length !== PERIOD_COUNT) return cur;
    return v.map((g, i) => sanitizeGroups(g, cur[i] ?? []));
  });
}

export function sanitizeHomeGrid(input: unknown, current: Record<DayKey, boolean[]>): Record<DayKey, boolean[]> {
  return sanitizeDayRecord(input, current, (v, cur) => {
    if (!Array.isArray(v) || v.length !== GRID_SLOT_COUNT) return cur;
    return v.map((b) => bool(b));
  });
}

export function sanitizeEarlyPeriod(input: unknown, current: EarlyPeriod): EarlyPeriod {
  if (!input || typeof input !== 'object') return current;
  const src = input as Record<string, unknown>;
  const grid = sanitizeDayRecord(src.grid, current.grid, (v, cur) => {
    const s = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    return {
      start: time(s.start, cur.start),
      end: time(s.end, cur.end),
      subject: str(s.subject)
    };
  });
  return {
    enabled: bool(src.enabled),
    groupLabel: str(src.groupLabel, 20),
    grid
  };
}

export function sanitizeSubjectTeachers(input: unknown, current: Record<string, string>): Record<string, string> {
  if (!input || typeof input !== 'object') return current;
  const src = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  Object.keys(src)
    .slice(0, 200)
    .forEach((subject) => {
      const name = str(subject, 60);
      if (!name) return;
      out[name] = str(src[subject]);
    });
  return out;
}

// Slots that just became "home class here" in this save (false -> true).
// Used to clear stale room-timetable overrides for exactly those slots,
// without touching overrides on slots the admin didn't just change.
export function newlyHomeSlots(
  before: Record<DayKey, boolean[]>,
  after: Record<DayKey, boolean[]>
): Array<{ day: DayKey; index: number }> {
  const out: Array<{ day: DayKey; index: number }> = [];
  DAY_KEYS.forEach((day) => {
    after[day].forEach((isHome, index) => {
      if (isHome && !before[day][index]) out.push({ day, index });
    });
  });
  return out;
}
