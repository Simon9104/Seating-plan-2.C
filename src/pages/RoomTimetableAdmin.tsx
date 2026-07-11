import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { colors, fontFamily } from '../theme';
import { DAY_KEYS, DAY_LABELS, type RoomTimetableState } from '../../shared/types';

export default function RoomTimetableAdmin() {
  const [draft, setDraft] = useState<RoomTimetableState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getRoomTimetable()
      .then(setDraft)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load the room timetable.'));
  }, []);

  function handleCellChange(day: (typeof DAY_KEYS)[number], index: number, value: string) {
    setDraft((prev) => (prev ? { grid: { ...prev.grid, [day]: prev.grid[day].map((v, i) => (i === index ? value : v)) } } : prev));
    setDirty(true);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const next = await api.saveRoomTimetable(draft.grid);
      setDraft(next);
      setDirty(false);
      setStatus('Room timetable saved ✓');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Could not save the room timetable.');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <div style={{ padding: 40, fontFamily, color: colors.danger }}>{loadError}</div>;
  if (!draft) return <div style={{ padding: 40, fontFamily, color: colors.textMuted }}>Loading…</div>;

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: colors.pageBg, fontFamily, color: colors.text, padding: 40, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={sectionLabelStyle}>Admin</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>Room Timetable</div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 6, maxWidth: 640 }}>
            For periods when your home class moves to a different room, fill in which other class uses THIS room
            instead. Leave blank whenever your home class is here — the display then falls back to your own weekly
            timetable.
          </div>
        </div>
        <Link to="/admin" style={navLinkStyle}>
          ← Back to seating admin
        </Link>
      </div>

      <div style={{ border: `2px solid ${colors.borderSoft}`, borderRadius: 16, padding: '24px 32px 32px', background: colors.cardBg, overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18, gap: 12 }}>
          {dirty && <span style={{ fontSize: 12, color: colors.rotateBlue }}>You have unsaved changes</span>}
          <button onClick={handleSave} disabled={saving || !dirty} style={{ ...saveButtonStyle, opacity: dirty ? 1 : 0.5 }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <span style={{ fontSize: 13, color: colors.textMuted }}>{status}</span>
        </div>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={theadCellStyle}>Day \ Period</th>
              {Array.from({ length: 10 }, (_, i) => i).map((n) => (
                <th key={n} style={{ ...theadCellStyle, textAlign: 'center', minWidth: 120 }}>
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_KEYS.map((day) => (
              <tr key={day} style={{ borderTop: `1px solid ${colors.borderHair}` }}>
                <td style={{ padding: '6px 8px', fontWeight: 600, color: colors.labelMuted, whiteSpace: 'nowrap' }}>{DAY_LABELS[day]}</td>
                {draft.grid[day].map((value, i) => (
                  <td key={i} style={{ padding: '6px 8px' }}>
                    <input
                      type="text"
                      value={value}
                      placeholder="(home class here)"
                      onChange={(e) => handleCellChange(day, i, e.target.value)}
                      style={{ ...cellInputStyle, background: value ? colors.spotlightBg : '#fff' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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

const cellInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: '5px 7px',
  fontSize: 12,
  color: colors.text
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
