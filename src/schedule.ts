// Computes "what's happening right now" from the weekly timetable + room
// overrides. Ported from the design prototype's computeSchedule(); runs
// entirely client-side against periodically-polled data so the live
// countdown can tick every second without hitting the network.
import { DAY_KEYS, type DayKey, type RoomTimetableState, type TimetableState } from '../shared/types';

export interface ScheduleView {
  currentSubject: string;
  currentTeacher: string;
  nextSubject: string;
  nextTeacher: string;
  countdownLabel: string;
  countdownText: string;
}

function toMinutes(hhmm: string): number | null {
  if (!hhmm) return null;
  const parts = hhmm.split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

interface Entry {
  subject: string;
  teacher: string;
  away?: boolean;
}

const FALLBACK: ScheduleView = {
  currentSubject: 'No school today',
  currentTeacher: '',
  nextSubject: '—',
  nextTeacher: '',
  countdownLabel: '',
  countdownText: '—'
};

export function computeSchedule(timetable: TimetableState | null, room: RoomTimetableState | null, now: Date): ScheduleView {
  if (!timetable) return FALLBACK;
  const periods = timetable.periods;
  const grid = timetable.grid;
  const dayIdx = now.getDay(); // 0=Sun..6=Sat
  const dayKey: DayKey | undefined = DAY_KEYS[dayIdx - 1];
  if (!dayKey || !periods.length) return FALLBACK;

  const nowMin = now.getHours() * 60 + now.getMinutes();

  const roomOverride = (gridIdx: number): string => {
    if (!room) return '';
    const day = room.grid[dayKey];
    return day ? day[gridIdx] || '' : '';
  };

  const cellText = (idx: number): Entry | null => {
    if (idx < 0 || idx >= periods.length) return null;
    const override = roomOverride(idx + 1);
    if (override) return { subject: override, teacher: '', away: true };
    const isSplit = timetable.splitGrid[dayKey]?.[idx];
    if (isSplit) {
      const groups = (timetable.groupsGrid[dayKey][idx] || []).filter((g) => g.subject);
      if (!groups.length) return null;
      const subject = groups.map((g) => (g.label ? `${g.label}: ` : '') + g.subject).join(' · ');
      const teacher = groups
        .map((g) => timetable.subjectTeachers[g.subject] || '')
        .filter(Boolean)
        .join(' · ');
      return { subject, teacher };
    }
    const subject = (grid[dayKey] || [])[idx];
    if (!subject) return null;
    return { subject, teacher: timetable.subjectTeachers[subject] || '' };
  };

  const early = timetable.earlyPeriod;
  const earlyDayData = early?.enabled ? early.grid[dayKey] : null;
  const earlyStart = earlyDayData ? toMinutes(earlyDayData.start) : null;
  const earlyEnd = earlyDayData ? toMinutes(earlyDayData.end) : null;
  const earlySubject = earlyDayData ? earlyDayData.subject : '';
  const earlyOverride = roomOverride(0);
  const earlyEntry: Entry | null = earlyOverride
    ? { subject: earlyOverride, teacher: '', away: true }
    : earlySubject
      ? { subject: (early!.groupLabel ? `${early!.groupLabel}: ` : '') + earlySubject, teacher: timetable.subjectTeachers[earlySubject] || '' }
      : null;

  // Currently inside the early period.
  if (earlyStart !== null && earlyEnd !== null && earlyEntry && nowMin >= earlyStart && nowMin < earlyEnd) {
    const nxt = cellText(0);
    const remain = Math.max(0, earlyEnd - nowMin) * 60 - now.getSeconds();
    return {
      currentSubject: earlyEntry.subject,
      currentTeacher: earlyEntry.teacher,
      nextSubject: nxt ? nxt.subject : 'End of day',
      nextTeacher: nxt ? nxt.teacher : '',
      countdownLabel: 'Ends in',
      countdownText: formatCountdown(remain)
    };
  }

  let currentIdx = -1;
  for (let i = 0; i < periods.length; i++) {
    const s = toMinutes(periods[i].start);
    const en = toMinutes(periods[i].end);
    if (s !== null && en !== null && nowMin >= s && nowMin < en) {
      currentIdx = i;
      break;
    }
  }

  if (currentIdx !== -1) {
    const cur = cellText(currentIdx) || { subject: 'Free period', teacher: '' };
    const nxt = cellText(currentIdx + 1);
    const endMin = toMinutes(periods[currentIdx].end) as number;
    const remain = Math.max(0, endMin - nowMin) * 60 - now.getSeconds();
    return {
      currentSubject: cur.subject,
      currentTeacher: cur.teacher,
      nextSubject: nxt ? nxt.subject : 'End of day',
      nextTeacher: nxt ? nxt.teacher : '',
      countdownLabel: 'Ends in',
      countdownText: formatCountdown(remain)
    };
  }

  // Between periods or before/after school.
  if (earlyStart !== null && earlyEntry && earlyStart > nowMin) {
    const remain = Math.max(0, earlyStart - nowMin) * 60 - now.getSeconds();
    return {
      currentSubject: 'Break',
      currentTeacher: '',
      nextSubject: earlyEntry.subject,
      nextTeacher: earlyEntry.teacher,
      countdownLabel: 'Starts in',
      countdownText: formatCountdown(remain)
    };
  }

  let nextIdx = -1;
  for (let i = 0; i < periods.length; i++) {
    const s = toMinutes(periods[i].start);
    if (s !== null && s > nowMin) {
      nextIdx = i;
      break;
    }
  }
  if (nextIdx === -1) {
    return { currentSubject: 'No more classes today', currentTeacher: '', nextSubject: '—', nextTeacher: '', countdownLabel: '', countdownText: '—' };
  }
  const nxt = cellText(nextIdx) || { subject: 'Free period', teacher: '' };
  const startMin = toMinutes(periods[nextIdx].start) as number;
  const remain = Math.max(0, startMin - nowMin) * 60 - now.getSeconds();
  return {
    currentSubject: 'Break',
    currentTeacher: '',
    nextSubject: nxt.subject,
    nextTeacher: nxt.teacher,
    countdownLabel: 'Starts in',
    countdownText: formatCountdown(remain)
  };
}
