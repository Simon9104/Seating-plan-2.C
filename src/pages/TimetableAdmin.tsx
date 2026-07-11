import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { colors, fontFamily } from '../theme';
import { DAY_KEYS, DAY_LABELS, MAX_SPLIT_GROUPS, type DayKey, type TimetableState } from '../../shared/types';

const SAVE_FIELDS: (keyof TimetableState)[] = ['periods', 'grid', 'splitGrid', 'groupsGrid', 'earlyPeriod', 'homeGrid'];

export default function TimetableAdmin() {
  const [draft, setDraft] = useState<TimetableState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectTeacher, setNewSubjectTeacher] = useState('');
  const [subjectError, setSubjectError] = useState('');

  useEffect(() => {
    api
      .getTimetable()
      .then(setDraft)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load the timetable.'));
  }, []);

  function edit(mutator: (s: TimetableState) => TimetableState) {
    setDraft((prev) => (prev ? mutator(prev) : prev));
    setDirty(true);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const patch: Partial<TimetableState> = {};
      SAVE_FIELDS.forEach((key) => {
        (patch as Record<string, unknown>)[key] = draft[key];
      });
      const next = await api.saveTimetable(patch);
      setDraft((prev) => (prev ? { ...prev, ...next } : next));
      setDirty(false);
      setStatus('Timetable saved ✓');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Could not save the timetable.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    setSubjectError('');
    const subject = newSubjectName.trim();
    const teacher = newSubjectTeacher.trim();
    if (!subject || !teacher) return;
    try {
      const next = await api.addSubject(subject, teacher);
      setDraft((prev) => (prev ? { ...prev, subjectTeachers: next.subjectTeachers } : next));
      setNewSubjectName('');
      setNewSubjectTeacher('');
    } catch (err) {
      setSubjectError(err instanceof ApiError ? err.message : 'Could not add that subject.');
    }
  }

  async function handleRemoveSubject(subject: string) {
    try {
      const next = await api.removeSubject(subject);
      setDraft((prev) => (prev ? { ...prev, subjectTeachers: next.subjectTeachers } : next));
    } catch {
      /* ignore */
    }
  }

  if (loadError) return <div style={{ padding: 40, fontFamily, color: colors.danger }}>{loadError}</div>;
  if (!draft) return <div style={{ padding: 40, fontFamily, color: colors.textMuted }}>Loading…</div>;

  const teacherFor = (subject: string) => (subject ? draft.subjectTeachers[subject] || '' : '');
  const subjectNames = Object.keys(draft.subjectTeachers);

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: colors.pageBg, fontFamily, color: colors.text, padding: 40, boxSizing: 'border-box' }}>
      <datalist id="subject-options">
        {subjectNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={sectionLabelStyle}>Admin</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>Weekly Timetable</div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 6 }}>
            Sets the current/next class shown on the main display. Students never see this page.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <Link to="/admin/room-timetable" style={navLinkStyle}>
            Room timetable →
          </Link>
          <Link to="/admin" style={navLinkStyle}>
            ← Back to seating admin
          </Link>
        </div>
      </div>

      <div style={{ border: `2px solid ${colors.borderSoft}`, borderRadius: 16, padding: '24px 32px 32px', background: colors.cardBg, marginBottom: 24, overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
          {dirty && <span style={{ fontSize: 12, color: colors.rotateBlue }}>You have unsaved changes</span>}
          <button onClick={handleSave} disabled={saving || !dirty} style={{ ...saveButtonStyle, opacity: dirty ? 1 : 0.5 }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <span style={{ fontSize: 13, color: colors.textMuted, marginLeft: 'auto' }}>{status}</span>
        </div>

        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={theadCellStyle}>Day \ Period</th>
              {Array.from({ length: 10 }, (_, i) => i).map((n) => (
                <th key={n} style={{ ...theadCellStyle, textAlign: 'center', minWidth: 110 }}>
                  {n}
                </th>
              ))}
            </tr>
            <tr>
              <td />
              <td style={{ padding: '4px 6px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: colors.textFaint }}>varies by day</span>
                </div>
              </td>
              {draft.periods.map((p, i) => (
                <td key={i} style={{ padding: '4px 6px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                    <input
                      type="time"
                      value={p.start}
                      onChange={(e) => edit((s) => ({ ...s, periods: s.periods.map((pp, ii) => (ii === i ? { ...pp, start: e.target.value } : pp)) }))}
                      style={timeInputStyle}
                    />
                    <input
                      type="time"
                      value={p.end}
                      onChange={(e) => edit((s) => ({ ...s, periods: s.periods.map((pp, ii) => (ii === i ? { ...pp, end: e.target.value } : pp)) }))}
                      style={timeInputStyle}
                    />
                    <label style={{ fontSize: 9, color: colors.textFaint, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <input
                        type="checkbox"
                        checked={p.isBreak}
                        onChange={(e) => edit((s) => ({ ...s, periods: s.periods.map((pp, ii) => (ii === i ? { ...pp, isBreak: e.target.checked } : pp)) }))}
                      />
                      Break
                    </label>
                  </div>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_KEYS.map((day) => (
              <tr key={day} style={{ borderTop: `1px solid ${colors.borderHair}` }}>
                <td style={{ padding: '6px 8px', fontWeight: 600, color: colors.labelMuted, whiteSpace: 'nowrap' }}>{DAY_LABELS[day]}</td>
                <EarlyCell draft={draft} day={day} edit={edit} teacherFor={teacherFor} />
                {draft.periods.map((p, i) => (
                  <RegularCell key={i} draft={draft} day={day} index={i} period={p} edit={edit} teacherFor={teacherFor} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ border: `2px solid ${colors.borderSoft}`, borderRadius: 16, padding: '24px 32px', background: colors.cardBg }}>
        <div style={sectionLabelStyle}>Setup</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Subjects &amp; teachers</div>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 14 }}>
          Set each subject's teacher once here — the grid above only needs the subject name.
        </div>
        {subjectNames.map((subject) => (
          <div key={subject} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${colors.borderHair}`, fontSize: 13 }}>
            <span style={{ flex: 1 }}>{subject}</span>
            <span style={{ flex: 1, color: colors.labelMuted }}>{draft.subjectTeachers[subject]}</span>
            <button onClick={() => handleRemoveSubject(subject)} style={removeButtonStyle}>
              ×
            </button>
          </div>
        ))}
        <form onSubmit={handleAddSubject} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <input
            type="text"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            placeholder="Subject (e.g. Math)"
            style={{ ...smallInputStyle, flex: 1 }}
          />
          <input
            type="text"
            value={newSubjectTeacher}
            onChange={(e) => setNewSubjectTeacher(e.target.value)}
            placeholder="Teacher"
            style={{ ...smallInputStyle, flex: 1 }}
          />
          <button type="submit" style={addButtonStyle}>
            Add
          </button>
        </form>
        {subjectError && <div style={{ fontSize: 12, color: colors.danger, marginTop: 6 }}>{subjectError}</div>}
      </div>
    </div>
  );
}

function EarlyCell({
  draft,
  day,
  edit,
  teacherFor
}: {
  draft: TimetableState;
  day: DayKey;
  edit: (mutator: (s: TimetableState) => TimetableState) => void;
  teacherFor: (subject: string) => string;
}) {
  const data = draft.earlyPeriod.grid[day];
  return (
    <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <input
          type="time"
          value={data.start}
          onChange={(e) =>
            edit((s) => ({ ...s, earlyPeriod: { ...s.earlyPeriod, grid: { ...s.earlyPeriod.grid, [day]: { ...s.earlyPeriod.grid[day], start: e.target.value } } } }))
          }
          style={{ ...timeInputStyle, width: '50%', boxSizing: 'border-box' }}
        />
        <input
          type="time"
          value={data.end}
          onChange={(e) =>
            edit((s) => ({ ...s, earlyPeriod: { ...s.earlyPeriod, grid: { ...s.earlyPeriod.grid, [day]: { ...s.earlyPeriod.grid[day], end: e.target.value } } } }))
          }
          style={{ ...timeInputStyle, width: '50%', boxSizing: 'border-box' }}
        />
      </div>
      <input
        type="text"
        list="subject-options"
        value={data.subject}
        placeholder="Subject"
        onChange={(e) =>
          edit((s) => ({ ...s, earlyPeriod: { ...s.earlyPeriod, grid: { ...s.earlyPeriod.grid, [day]: { ...s.earlyPeriod.grid[day], subject: e.target.value } } } }))
        }
        style={subjectInputStyle}
      />
      <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 2 }}>{teacherFor(data.subject)}</div>
      <label style={homeCheckboxStyle}>
        <input
          type="checkbox"
          checked={draft.homeGrid[day][0]}
          onChange={(e) => edit((s) => ({ ...s, homeGrid: { ...s.homeGrid, [day]: s.homeGrid[day].map((v, i) => (i === 0 ? e.target.checked : v)) } }))}
        />
        Home class here
      </label>
    </td>
  );
}

function RegularCell({
  draft,
  day,
  index,
  period,
  edit,
  teacherFor
}: {
  draft: TimetableState;
  day: DayKey;
  index: number;
  period: { isBreak: boolean };
  edit: (mutator: (s: TimetableState) => TimetableState) => void;
  teacherFor: (subject: string) => string;
}) {
  if (period.isBreak) {
    return (
      <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
        <div style={{ textAlign: 'center', fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', color: colors.textFaint }}>Break</div>
      </td>
    );
  }

  const isSplit = draft.splitGrid[day][index];
  const groups = draft.groupsGrid[day][index] || [];
  const gridIdx = index + 1;

  if (isSplit) {
    return (
      <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {groups.map((g, gi) => (
            <div key={gi} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="text"
                value={g.label}
                placeholder="Group"
                onChange={(e) =>
                  edit((s) => ({
                    ...s,
                    groupsGrid: {
                      ...s.groupsGrid,
                      [day]: s.groupsGrid[day].map((cell, ci) => (ci === index ? cell.map((gg, ggi) => (ggi === gi ? { ...gg, label: e.target.value } : gg)) : cell))
                    }
                  }))
                }
                style={{ ...timeInputStyle, width: 44, flexShrink: 0 }}
              />
              <input
                type="text"
                list="subject-options"
                value={g.subject}
                placeholder="Subject"
                onChange={(e) =>
                  edit((s) => ({
                    ...s,
                    groupsGrid: {
                      ...s.groupsGrid,
                      [day]: s.groupsGrid[day].map((cell, ci) => (ci === index ? cell.map((gg, ggi) => (ggi === gi ? { ...gg, subject: e.target.value } : gg)) : cell))
                    }
                  }))
                }
                style={{ ...subjectInputStyle, flex: 1, minWidth: 0 }}
              />
              <button
                onClick={() =>
                  edit((s) => ({
                    ...s,
                    groupsGrid: { ...s.groupsGrid, [day]: s.groupsGrid[day].map((cell, ci) => (ci === index ? cell.filter((_, ggi) => ggi !== gi) : cell)) }
                  }))
                }
                style={removeButtonStyle}
              >
                ×
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={groups.length >= MAX_SPLIT_GROUPS}
              onClick={() =>
                edit((s) => ({
                  ...s,
                  groupsGrid: {
                    ...s.groupsGrid,
                    [day]: s.groupsGrid[day].map((cell, ci) =>
                      ci === index ? cell.concat([{ label: String.fromCharCode(65 + cell.length), subject: '' }]) : cell
                    )
                  }
                }))
              }
              style={linkButtonStyle}
            >
              + group
            </button>
            <button
              onClick={() =>
                edit((s) => ({ ...s, splitGrid: { ...s.splitGrid, [day]: s.splitGrid[day].map((v, i) => (i === index ? false : v)) } }))
              }
              style={{ ...linkButtonStyle, color: colors.textFaint }}
            >
              Merge back
            </button>
          </div>
        </div>
      </td>
    );
  }

  const subject = draft.grid[day][index];
  return (
    <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
      <input
        type="text"
        list="subject-options"
        value={subject}
        placeholder="Subject"
        onChange={(e) => edit((s) => ({ ...s, grid: { ...s.grid, [day]: s.grid[day].map((v, i) => (i === index ? e.target.value : v)) } }))}
        style={subjectInputStyle}
      />
      <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 2 }}>{teacherFor(subject)}</div>
      <label style={homeCheckboxStyle}>
        <input
          type="checkbox"
          checked={draft.homeGrid[day][gridIdx]}
          onChange={(e) => edit((s) => ({ ...s, homeGrid: { ...s.homeGrid, [day]: s.homeGrid[day].map((v, i) => (i === gridIdx ? e.target.checked : v)) } }))}
        />
        Home class here
      </label>
      <button
        onClick={() =>
          edit((s) => {
            const splitGrid = { ...s.splitGrid, [day]: s.splitGrid[day].map((v, i) => (i === index ? true : v)) };
            const currentGroups = s.groupsGrid[day][index];
            const groupsGrid =
              currentGroups && currentGroups.length
                ? s.groupsGrid
                : {
                    ...s.groupsGrid,
                    [day]: s.groupsGrid[day].map((cell, i) => (i === index ? [{ label: 'A', subject: '' }, { label: 'B', subject: '' }] : cell))
                  };
            return { ...s, splitGrid, groupsGrid };
          })
        }
        style={linkButtonStyle}
      >
        Split into groups
      </button>
    </td>
  );
}

const sectionLabelStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: colors.textMuted,
  marginBottom: 4
};

const navLinkStyle: CSSProperties = { fontSize: 13, color: colors.rotateBlue, textDecoration: 'none' };

const theadCellStyle: CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  color: colors.textFaint,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em'
};

const timeInputStyle: CSSProperties = {
  width: 90,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: 4,
  fontSize: 11,
  color: colors.text
};

const subjectInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: '5px 7px',
  fontSize: 12,
  color: colors.text
};

const smallInputStyle: CSSProperties = {
  minWidth: 0,
  padding: '7px 8px',
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  fontSize: 13,
  color: colors.text,
  boxSizing: 'border-box'
};

const homeCheckboxStyle: CSSProperties = {
  fontSize: 9,
  color: colors.textFaint,
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  marginTop: 3
};

const linkButtonStyle: CSSProperties = {
  fontSize: 10,
  color: colors.rotateBlue,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '3px 0'
};

const removeButtonStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  color: colors.textFaint,
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1
};

const addButtonStyle: CSSProperties = {
  padding: '7px 12px',
  border: 'none',
  borderRadius: 6,
  background: colors.text,
  color: '#fff',
  fontSize: 13,
  cursor: 'pointer'
};

const saveButtonStyle: CSSProperties = {
  padding: '8px 14px',
  border: 'none',
  borderRadius: 6,
  background: colors.text,
  color: '#fff',
  fontSize: 13,
  cursor: 'pointer'
};
