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

export const SEAT_COUNT = 30;
export const TABLE_COUNT = 15;
export const MAX_HISTORY = 20;
