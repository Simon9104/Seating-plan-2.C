import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { colors, fontFamily } from '../theme';
import type { BotLogCountrySummary, BotLogEntry } from '../../shared/types';

const PAGE_SIZE = 50;

export default function BotActivity() {
  const [entries, setEntries] = useState<BotLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [countries, setCountries] = useState<BotLogCountrySummary[]>([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  function load(nextOffset: number, country: string) {
    setLoading(true);
    api
      .botLog(PAGE_SIZE, nextOffset, country || undefined)
      .then((r) => {
        setEntries(r.entries);
        setTotal(r.total);
        setOffset(nextOffset);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load bot activity.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(0, '');
    api
      .botLogSummary()
      .then((r) => setCountries(r.countries))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCountryClick(code: string) {
    const next = countryFilter === code ? '' : code;
    setCountryFilter(next);
    load(0, next);
  }

  if (loadError) return <div style={{ padding: 40, fontFamily, color: colors.danger }}>{loadError}</div>;

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: colors.pageBg, fontFamily, color: colors.text, padding: 40, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={sectionLabelStyle}>Admin</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>Bot Activity</div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 6, maxWidth: 640 }}>
            Hits on decoy admin-login pages (common CMS paths bots scan for). Nobody ever actually signs in through
            them — every attempt is just logged here.
          </div>
        </div>
        <Link to="/admin" style={navLinkStyle}>
          ← Back to seating admin
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ width: 220, flexShrink: 0, border: `2px solid ${colors.borderSoft}`, borderRadius: 16, padding: 20, background: colors.cardBg, alignSelf: 'flex-start' }}>
          <div style={sectionLabelStyle}>By country</div>
          {countries.length === 0 && <div style={{ fontSize: 13, color: colors.textDisabled, marginTop: 8 }}>No activity yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
            {countries.map((c) => (
              <button
                key={c.countryCode || 'unknown'}
                onClick={() => handleCountryClick(c.countryCode || '')}
                style={{
                  ...countryRowStyle,
                  background: countryFilter === (c.countryCode || '') ? colors.defaultEnabledBg : 'transparent'
                }}
              >
                <span>{c.countryName || 'Unknown'}</span>
                <span style={{ color: colors.textMuted }}>{c.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, border: `2px solid ${colors.borderSoft}`, borderRadius: 16, padding: 24, background: colors.cardBg }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
            <span style={{ fontSize: 13, color: colors.textMuted }}>
              {total} total hit{total === 1 ? '' : 's'}
              {countryFilter && ` — filtered to ${countryFilter}`}
            </span>
            {loading && <span style={{ fontSize: 12, color: colors.textFaint }}>Loading…</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={theadCellStyle}>Time</th>
                  <th style={theadCellStyle}>Path</th>
                  <th style={theadCellStyle}>Method</th>
                  <th style={theadCellStyle}>IP</th>
                  <th style={theadCellStyle}>Location</th>
                  <th style={theadCellStyle}>Username</th>
                  <th style={theadCellStyle}>Password</th>
                  <th style={theadCellStyle}>User agent</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} style={{ borderTop: `1px solid ${colors.borderHair}` }}>
                    <td style={tdStyle}>{new Date(e.createdAt + 'Z').toLocaleString()}</td>
                    <td style={tdStyle}>{e.path}</td>
                    <td style={tdStyle}>{e.method}</td>
                    <td style={tdStyle}>{e.ip || '—'}</td>
                    <td style={tdStyle}>
                      {[e.city, e.region, e.countryName].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace' }}>{e.username || '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace' }}>{e.password || '—'}</td>
                    <td style={{ ...tdStyle, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.userAgent || ''}>
                      {e.userAgent || '—'}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && !loading && (
                  <tr>
                    <td style={tdStyle} colSpan={8}>
                      No activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button disabled={offset === 0} onClick={() => load(Math.max(0, offset - PAGE_SIZE), countryFilter)} style={pageButtonStyle}>
              ← Newer
            </button>
            <button disabled={offset + PAGE_SIZE >= total} onClick={() => load(offset + PAGE_SIZE, countryFilter)} style={pageButtonStyle}>
              Older →
            </button>
          </div>
        </div>
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
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap'
};

const tdStyle: CSSProperties = { padding: '6px 8px', whiteSpace: 'nowrap' };

const countryRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  border: 'none',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
  cursor: 'pointer',
  textAlign: 'left'
};

const pageButtonStyle: CSSProperties = {
  padding: '7px 12px',
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  background: '#fff',
  color: colors.text,
  fontSize: 13,
  cursor: 'pointer'
};
