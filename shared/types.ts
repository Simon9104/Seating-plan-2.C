// Shared between the frontend (src/) and the Netlify Functions backend
// (netlify/functions/) so both sides agree on the exact shape of the
// seating-plan data.

export type Seat = 'A' | 'B';

export interface Rule {
  id: number;
  name: string;
  table: number;
  seat: Seat;
}

export interface AvoidPair {
  id: number;
  a: string;
  b: string;
}

export interface HistoryEntry {
  id: number;
  timestamp: number;
  seats: string[];
}

export interface SeatingState {
  names: string[];
  seats: string[];
  rules: Rule[];
  avoidPairs: AvoidPair[];
  pairHistory: Record<string, boolean>;
  history: HistoryEntry[];
  defaultSeats: string[] | null;
  rosterLocked: boolean;
  labelStyle: 'numbers' | 'letters';
  deskAccent: string;
}

export interface PublicSeating {
  seats: string[];
  labelStyle: 'numbers' | 'letters';
  deskAccent: string;
}

export interface AdminSummary {
  username: string;
  displayName: string;
  createdAt: string;
  createdBy: string | null;
}

export interface AuditEntry {
  id: number;
  adminUsername: string;
  action: string;
  details: string | null;
  createdAt: string;
}

export interface BotLogEntry {
  id: number;
  path: string;
  method: string;
  ip: string | null;
  countryCode: string | null;
  countryName: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  userAgent: string | null;
  username: string | null;
  password: string | null;
  createdAt: string;
}

export interface BotLogCountrySummary {
  countryCode: string | null;
  countryName: string | null;
  count: number;
}

export const SEAT_COUNT = 30;
export const TABLE_COUNT = 15;
export const MAX_HISTORY = 20;

// ---- Timetable ----

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday'
};
export const PERIOD_COUNT = 9;
// Index 0 = optional early period, 1-9 = regular periods (matches homeGrid / room-timetable indexing).
export const GRID_SLOT_COUNT = PERIOD_COUNT + 1;
export const MAX_SPLIT_GROUPS = 4;

export const FIXED_TIMES: { start: string; end: string }[] = [
  { start: '07:05', end: '07:50' },
  { start: '08:00', end: '08:45' },
  { start: '08:55', end: '09:35' },
  { start: '09:45', end: '10:30' },
  { start: '10:50', end: '11:35' },
  { start: '11:45', end: '12:30' },
  { start: '12:40', end: '13:25' },
  { start: '13:30', end: '14:15' },
  { start: '14:30', end: '15:15' },
  { start: '15:20', end: '16:05' }
];

export interface Period {
  start: string;
  end: string;
  isBreak: boolean;
}

export interface TimetableGroup {
  label: string;
  subject: string;
}

export interface EarlyPeriodDay {
  start: string;
  end: string;
  subject: string;
}

export interface EarlyPeriod {
  enabled: boolean;
  groupLabel: string;
  grid: Record<DayKey, EarlyPeriodDay>;
}

export interface TimetableState {
  periods: Period[]; // length PERIOD_COUNT
  grid: Record<DayKey, string[]>; // length PERIOD_COUNT, subject name per period
  splitGrid: Record<DayKey, boolean[]>; // length PERIOD_COUNT
  groupsGrid: Record<DayKey, TimetableGroup[][]>; // length PERIOD_COUNT
  earlyPeriod: EarlyPeriod;
  homeGrid: Record<DayKey, boolean[]>; // length GRID_SLOT_COUNT (0 = early, 1-9 = periods)
  subjectTeachers: Record<string, string>;
}

export interface RoomTimetableState {
  grid: Record<DayKey, string[]>; // length GRID_SLOT_COUNT (0 = early, 1-9 = periods)
}
