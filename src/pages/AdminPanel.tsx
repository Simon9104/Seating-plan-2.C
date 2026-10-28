import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { colors, fontFamily } from '../theme';
import { TABLE_COLUMNS, type AdminSummary, type AuditEntry, type SeatingState } from '../../shared/types';

const AUDIT_PAGE_SIZE = 50;

interface Line {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function getTablemates(name: string, pairHistory: Record<string, boolean>): string[] {
  const mates = new Set<string>();
  Object.keys(pairHistory).forEach((key) => {
    const parts = key.split('|');
    if (parts[0] === name) mates.add(parts[1]);
    else if (parts[1] === name) mates.add(parts[0]);
  });
  return Array.from(mates);
}

export default function AdminPanel({
  admin,
  onLoggedOut
}: {
  admin: { username: string; displayName: string };
  onLoggedOut: () => void;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<SeatingState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleTable, setNewRuleTable] = useState(1);
  const [newRuleSeat, setNewRuleSeat] = useState<'A' | 'B'>('A');
  const [newPairA, setNewPairA] = useState('');
  const [newPairB, setNewPairB] = useState('');
  const [newFixedA, setNewFixedA] = useState('');
  const [newFixedB, setNewFixedB] = useState('');
  const [watchedStudent, setWatchedStudent] = useState('');
  const [busy, setBusy] = useState(false);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditHasMore, setAuditHasMore] = useState(true);

  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [adminForm, setAdminForm] = useState({ username: '', displayName: '', password: '', currentPassword: '' });
  const [adminFormError, setAdminFormError] = useState('');
  const [adminFormBusy, setAdminFormBusy] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const seatEls = useRef<Record<number, HTMLElement | null>>({});
  const [lines, setLines] = useState<Line[]>([]);

  // Roster names are edited as a local draft — nothing is sent to the server
  // while typing. The draft is only saved (in one request) when the admin
  // clicks "Lock roster", which also freezes the fields against further edits.
  const [draftNames, setDraftNames] = useState<string[]>(new Array(30).fill(''));
  const draftSeeded = useRef(false);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    api
      .getState()
      .then(setState)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load the seating plan.'));
    loadAudit(0, true);
    api
      .listAdmins()
      .then((r) => setAdmins(r.admins))
      .catch(() => {});
    return () => clearTimeout(flashTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state && !draftSeeded.current) {
      setDraftNames(state.names);
      draftSeeded.current = true;
    }
  }, [state]);

  function loadAudit(offset: number, replace: boolean) {
    api
      .auditLog(AUDIT_PAGE_SIZE, offset)
      .then((r) => {
        setAudit((prev) => (replace ? r.entries : prev.concat(r.entries)));
        setAuditOffset(offset + r.entries.length);
        setAuditHasMore(r.entries.length === AUDIT_PAGE_SIZE);
      })
      .catch(() => {});
  }

  function flashNow() {
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1200);
  }

  function handleDraftNameChange(index: number, value: string) {
    setDraftNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  async function handleToggleLock() {
    if (!state) return;
    setBusy(true);
    try {
      const next = state.rosterLocked ? await api.toggleLock() : await api.toggleLock(draftNames);
      setState(next);
      setDraftNames(next.names);
      setStatus(next.rosterLocked ? 'Roster locked — names saved ✓' : 'Roster unlocked ✓');
      loadAudit(0, true);
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<SeatingState>, message: string) {
    setBusy(true);
    try {
      const next = await action();
      setState(next);
      setStatus(message);
      loadAudit(0, true);
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!state) return;
    const wrap = wrapRef.current;
    const watched = watchedStudent && state.names.indexOf(watchedStudent) !== -1 ? watchedStudent : null;
    if (!wrap || !watched) {
      setLines((prev) => (prev.length ? [] : prev));
      return;
    }
    const watchedIdx = state.seats.indexOf(watched);
    const watchedEl = watchedIdx !== -1 ? seatEls.current[watchedIdx] : null;
    if (!watchedEl) {
      setLines((prev) => (prev.length ? [] : prev));
      return;
    }
    const wrapRect = wrap.getBoundingClientRect();
    const watchedRect = watchedEl.getBoundingClientRect();
    const sx = watchedRect.left + watchedRect.width / 2 - wrapRect.left;
    const sy = watchedRect.top + watchedRect.height / 2 - wrapRect.top;
    const mates = getTablemates(watched, state.pairHistory);
    const next: Line[] = [];
    mates.forEach((mate) => {
      const idx = state.seats.indexOf(mate);
      if (idx === -1) return;
      const el = seatEls.current[idx];
      if (!el) return;
      const r = el.getBoundingClientRect();
      next.push({
        key: mate,
        x1: sx,
        y1: sy,
        x2: r.left + r.width / 2 - wrapRect.left,
        y2: r.top + r.height / 2 - wrapRect.top
      });
    });
    setLines(next);
  }, [state, watchedStudent]);

  const lockedSlots = useMemo(() => {
    const set: Record<number, boolean> = {};
    state?.rules.forEach((r) => {
      set[(r.table - 1) * 2 + (r.seat === 'A' ? 0 : 1)] = true;
    });
    return set;
  }, [state]);

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    onLoggedOut();
    navigate('/admin/login');
  }

  async function submitNewAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdminFormError('');
    setAdminFormBusy(true);
    try {
      await api.createAdmin(adminForm);
      setAdminForm({ username: '', displayName: '', password: '', currentPassword: '' });
      const r = await api.listAdmins();
      setAdmins(r.admins);
      loadAudit(0, true);
    } catch (err) {
      setAdminFormError(err instanceof ApiError ? err.message : 'Could not create the admin account.');
    } finally {
      setAdminFormBusy(false);
    }
  }

  async function removeAdminAccount(username: string) {
    if (!window.confirm(`Remove admin account "${username}"? This cannot be undone.`)) return;
    try {
      await api.removeAdmin(username);
      const r = await api.listAdmins();
      setAdmins(r.admins);
      loadAudit(0, true);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not remove that admin account.');
    }
  }

  if (loadError) {
    return <div style={{ padding: 40, fontFamily, color: colors.danger }}>{loadError}</div>;
  }
  if (!state) {
    return <div style={{ padding: 40, fontFamily, color: colors.textMuted }}>Loading…</div>;
  }

  const nameCount = draftNames.filter(Boolean).length;
  const availableNames = state.names.filter((n) => n && state.rules.every((r) => r.name !== n));
  const pairNames = state.names.filter(Boolean);
  const watchOptions = state.names.filter(Boolean);
  const fixedPairs = state.fixedPairs || [];
  const unpairedNames = pairNames.filter((n) => fixedPairs.every((p) => p.a !== n && p.b !== n));
  const isSpotlight = (n: string) => !!n && n.trim().toLowerCase() === 'simon';

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        background: colors.pageBg,
        fontFamily,
        color: colors.text,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        padding: 40,
        boxSizing: 'border-box'
      }}
    >
      <div style={{ display: 'flex', gap: 32, width: '100%' }}>
      <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div style={sectionLabelStyle}>Admin</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Class Roster</div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              {now.toLocaleTimeString('en-GB')}
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 6 }}>
              Type names, then click "Lock roster" to save them to the main seating chart. Students never see this
              page.
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: colors.textMuted, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${colors.borderHair}`, paddingBottom: 10 }}>
          <span>
            Signed in as <strong style={{ color: colors.text }}>{admin.displayName}</strong>
          </span>
          <button onClick={handleLogout} style={linkButtonStyle}>Sign out</button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px 14px',
            maxHeight: 520,
            overflowY: 'auto',
            scrollbarGutter: 'stable',
            paddingRight: 12,
            boxSizing: 'border-box'
          }}
        >
          {draftNames.map((value, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, flexShrink: 0, color: colors.textFaint, fontSize: 12, textAlign: 'right' }}>{i + 1}</span>
              <input
                type="text"
                value={value}
                disabled={state.rosterLocked}
                placeholder="Name"
                onChange={(e) => handleDraftNameChange(i, e.target.value)}
                style={rosterInputStyle}
              />
            </div>
          ))}
        </div>

        <button onClick={handleToggleLock} disabled={busy} style={{ ...secondaryButtonStyle, background: state.rosterLocked ? colors.lockedBg : '#fff' }}>
          {state.rosterLocked ? 'Unlock roster' : 'Lock roster'}
        </button>
        <div style={{ fontSize: 13, color: colors.textMuted }}>{nameCount} of 30 seats filled</div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { run(() => api.shuffle(), 'Shuffled ✓'); flashNow(); }} disabled={busy} style={{ ...primaryButtonStyle, flex: 1 }}>
            Random shuffle
          </button>
          <button
            title="Everyone advances one seat along a snake path through the room"
            onClick={() => { run(() => api.rotate(), 'Rotated seats ✓'); flashNow(); }}
            disabled={busy}
            style={{ ...primaryButtonStyle, flex: 1, background: colors.rotateBlue }}
          >
            Rotate seats
          </button>
        </div>
        <button
          title="Each fixed pair moves together to a random table; everyone else is shuffled around them"
          onClick={() => { run(() => api.shufflePairs(), 'Shuffled pairs ✓'); flashNow(); }}
          disabled={busy || fixedPairs.length === 0}
          style={{ ...primaryButtonStyle, background: colors.rotateBlue, opacity: fixedPairs.length === 0 ? 0.5 : 1 }}
        >
          Shuffle pairs
        </button>
        <button onClick={() => run(() => api.clearHistory(), 'Seating history cleared ✓')} disabled={busy} style={secondaryButtonStyle}>
          Clear
        </button>
        <div style={{ fontSize: 13, color: colors.textMuted, minHeight: 16 }}>{status}</div>

        <div style={sectionBlockStyle}>
          <div style={sectionLabelStyle}>Start of year</div>
          <div style={sectionTitleStyle}>Default seating</div>
          <div style={sectionHintStyle}>Save the current arrangement as your baseline, and jump back to it anytime.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => run(() => api.saveDefault(), 'Start-of-year seating saved as default ✓')} disabled={busy} style={{ ...secondaryButtonStyle, flex: 1 }}>
              Save as default
            </button>
            <button
              onClick={() => run(() => api.resetDefault(), 'Restored default seating ✓')}
              disabled={busy || !state.defaultSeats}
              style={{
                flex: 1,
                padding: 10,
                border: 'none',
                borderRadius: 8,
                background: state.defaultSeats ? colors.defaultEnabledBg : colors.defaultDisabledBg,
                color: state.defaultSeats ? colors.text : colors.textDisabled,
                fontSize: 13,
                cursor: state.defaultSeats ? 'pointer' : 'not-allowed'
              }}
            >
              Reset to default
            </button>
          </div>
        </div>

        <div style={sectionBlockStyle}>
          <div style={sectionLabelStyle}>Rules</div>
          <div style={sectionTitleStyle}>Locked seats</div>
          <div style={sectionHintStyle}>Pin a student to a fixed seat — shuffle will never move them.</div>
          {state.rules.map((r) => (
            <div key={r.id} style={ruleRowStyle}>
              <span style={{ flex: 1 }}>
                {r.name} → Table {r.table}, Seat {r.seat}
              </span>
              <button onClick={() => run(() => api.removeRule(r.id), 'Saved to main chart')} style={removeButtonStyle}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <select value={newRuleName} onChange={(e) => setNewRuleName(e.target.value)} style={selectFlexStyle}>
              <option value="">Student…</option>
              {availableNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select value={newRuleTable} onChange={(e) => setNewRuleTable(Number(e.target.value))} style={selectNarrowStyle}>
              {Array.from({ length: 15 }, (_, i) => i + 1).map((tn) => (
                <option key={tn} value={tn}>{tn}</option>
              ))}
            </select>
            <select value={newRuleSeat} onChange={(e) => setNewRuleSeat(e.target.value as 'A' | 'B')} style={selectTinyStyle}>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
            <button
              onClick={() => {
                if (!newRuleName) return;
                run(() => api.addRule(newRuleName, newRuleTable, newRuleSeat), 'Saved to main chart');
                setNewRuleName('');
                setNewRuleTable(1);
                setNewRuleSeat('A');
              }}
              style={addButtonStyle}
            >
              Add
            </button>
          </div>
        </div>

        <div style={sectionBlockStyle}>
          <div style={sectionLabelStyle}>Rules</div>
          <div style={sectionTitleStyle}>Fixed pairs</div>
          <div style={sectionHintStyle}>These two always share a table. "Shuffle pairs" moves each pair together to a random table.</div>
          {fixedPairs.map((p) => (
            <div key={p.id} style={ruleRowStyle}>
              <span style={{ flex: 1 }}>{p.a} + {p.b}</span>
              <button onClick={() => run(() => api.removeFixedPair(p.id), 'Saved to main chart')} style={removeButtonStyle}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <select value={newFixedA} onChange={(e) => setNewFixedA(e.target.value)} style={selectFlexStyle}>
              <option value="">Student…</option>
              {unpairedNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select value={newFixedB} onChange={(e) => setNewFixedB(e.target.value)} style={selectFlexStyle}>
              <option value="">Student…</option>
              {unpairedNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!newFixedA || !newFixedB || newFixedA === newFixedB) return;
                run(() => api.addFixedPair(newFixedA, newFixedB), 'Saved to main chart');
                setNewFixedA('');
                setNewFixedB('');
              }}
              style={addButtonStyle}
            >
              Add
            </button>
          </div>
        </div>

        <div style={sectionBlockStyle}>
          <div style={sectionLabelStyle}>Rules</div>
          <div style={sectionTitleStyle}>Keep apart</div>
          <div style={sectionHintStyle}>Random shuffle will never seat these two at the same table.</div>
          {state.avoidPairs.map((p) => (
            <div key={p.id} style={ruleRowStyle}>
              <span style={{ flex: 1 }}>{p.a} ↔ {p.b}</span>
              <button onClick={() => run(() => api.removeAvoidPair(p.id), 'Saved to main chart')} style={removeButtonStyle}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <select value={newPairA} onChange={(e) => setNewPairA(e.target.value)} style={selectFlexStyle}>
              <option value="">Student…</option>
              {pairNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select value={newPairB} onChange={(e) => setNewPairB(e.target.value)} style={selectFlexStyle}>
              <option value="">Student…</option>
              {pairNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!newPairA || !newPairB || newPairA === newPairB) return;
                run(() => api.addAvoidPair(newPairA, newPairB), 'Saved to main chart');
                setNewPairA('');
                setNewPairB('');
              }}
              style={addButtonStyle}
            >
              Add
            </button>
          </div>
        </div>

        <div style={sectionBlockStyle}>
          <div style={sectionLabelStyle}>Log</div>
          <div style={sectionTitleStyle}>Seating history</div>
          <div style={sectionHintStyle}>Every shuffle is remembered so classmates don't repeat as tablemates.</div>
          {state.history.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {state.history.map((h) => (
                <div key={h.id} style={ruleRowStyle}>
                  <span style={{ flex: 1, color: colors.labelMuted }}>
                    {new Date(h.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <button onClick={() => run(() => api.restoreHistory(h.id), 'Restored past seating ✓')} style={restoreButtonStyle}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: colors.textDisabled }}>No shuffles yet.</div>
          )}
        </div>

        <div style={sectionBlockStyle}>
          <div style={sectionLabelStyle}>Log</div>
          <div style={sectionTitleStyle}>Activity log</div>
          <div style={sectionHintStyle}>Every admin change is recorded here, along with who made it.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
            {audit.map((entry) => (
              <div key={entry.id} style={{ padding: '6px 0', borderBottom: `1px solid ${colors.borderHair}`, fontSize: 12 }}>
                <div style={{ color: colors.text }}>
                  <strong>{entry.adminUsername}</strong> — {formatAction(entry.action)}
                </div>
                {entry.details && <div style={{ color: colors.textMuted }}>{entry.details}</div>}
                <div style={{ color: colors.textFaint }}>{new Date(entry.createdAt + 'Z').toLocaleString()}</div>
              </div>
            ))}
            {audit.length === 0 && <div style={{ fontSize: 13, color: colors.textDisabled }}>No activity yet.</div>}
          </div>
          {auditHasMore && (
            <button onClick={() => loadAudit(auditOffset, false)} style={{ ...secondaryButtonStyle, marginTop: 8 }}>
              Load more
            </button>
          )}
        </div>

        <div style={sectionBlockStyle}>
          <div style={sectionLabelStyle}>Access</div>
          <div style={sectionTitleStyle}>Admins</div>
          <div style={sectionHintStyle}>Everyone listed here can sign in and change the seating chart.</div>
          {admins.map((a) => (
            <div key={a.username} style={ruleRowStyle}>
              <span style={{ flex: 1 }}>
                {a.displayName} <span style={{ color: colors.textFaint }}>({a.username})</span>
              </span>
              {a.username !== admin.username && (
                <button onClick={() => removeAdminAccount(a.username)} style={removeButtonStyle}>×</button>
              )}
            </div>
          ))}
          <form onSubmit={submitNewAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            <input
              type="text"
              placeholder="Username"
              value={adminForm.username}
              onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
              style={rosterInputStyle}
              required
            />
            <input
              type="text"
              placeholder="Display name"
              value={adminForm.displayName}
              onChange={(e) => setAdminForm({ ...adminForm, displayName: e.target.value })}
              style={rosterInputStyle}
              required
            />
            <input
              type="password"
              placeholder="New admin's password (12+ chars)"
              value={adminForm.password}
              onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
              style={rosterInputStyle}
              required
            />
            <input
              type="password"
              placeholder="Your password (to confirm)"
              value={adminForm.currentPassword}
              onChange={(e) => setAdminForm({ ...adminForm, currentPassword: e.target.value })}
              style={rosterInputStyle}
              required
            />
            {adminFormError && <div style={{ fontSize: 12, color: colors.danger }}>{adminFormError}</div>}
            <button type="submit" disabled={adminFormBusy} style={addButtonStyle}>
              Add admin
            </button>
          </form>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ border: `2px solid ${colors.borderSoft}`, borderRadius: 16, padding: '32px 40px 40px', background: colors.cardBg }}>
          <div style={{ textAlign: 'center', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: colors.textFaint, marginBottom: 6 }}>
            Front of room
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: colors.textFaint, marginBottom: 18 }}>
            Drag a student onto another seat to swap them
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 28 }}>
            <div style={{ width: 150, height: 60, borderRadius: 8, background: state.deskAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>
              Teacher
            </div>
          </div>
          <div style={{ position: 'relative' }} ref={wrapRef}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TABLE_COLUMNS.length}, 1fr)`, gap: 24 }}>
              {TABLE_COLUMNS.map((column, c) => (
              <div key={c} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24 }}>
              {column.map((i) => {
                const label = state.labelStyle === 'letters' ? String.fromCharCode(65 + i) : String(i + 1);
                const aIdx = i * 2;
                const bIdx = i * 2 + 1;
                return (
                  <div key={i} style={{ border: `1px solid ${colors.borderSoft}`, borderRadius: 10, padding: 14, background: colors.tableBg }}>
                    <div style={{ textAlign: 'center', fontSize: 12, color: colors.textFaint, marginBottom: 10, letterSpacing: '0.04em' }}>
                      Table {label}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <SeatBox
                        idx={aIdx}
                        name={state.seats[aIdx]}
                        locked={!!lockedSlots[aIdx]}
                        spotlight={isSpotlight(state.seats[aIdx])}
                        flash={flash}
                        onRef={(el) => (seatEls.current[aIdx] = el)}
                        onSwap={(from, to) => run(() => api.swapSeats(from, to), 'Saved to main chart')}
                      />
                      <SeatBox
                        idx={bIdx}
                        name={state.seats[bIdx]}
                        locked={!!lockedSlots[bIdx]}
                        spotlight={isSpotlight(state.seats[bIdx])}
                        flash={flash}
                        onRef={(el) => (seatEls.current[bIdx] = el)}
                        onSwap={(from, to) => run(() => api.swapSeats(from, to), 'Saved to main chart')}
                      />
                    </div>
                  </div>
                );
              })}
              </div>
              ))}
            </div>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {lines.map((ln) => (
                <line key={ln.key} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke={colors.watchLine} strokeWidth={2.5} strokeLinecap="round" />
              ))}
            </svg>
          </div>

          {watchedStudent && state.names.indexOf(watchedStudent) !== -1 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${colors.borderSoft}`, fontSize: 13, color: colors.labelMuted }}>
              <strong style={{ color: colors.text }}>{watchedStudent} has sat with:</strong>{' '}
              {(() => {
                const mates = getTablemates(watchedStudent, state.pairHistory);
                return mates.length ? mates.join(', ') : 'no one yet';
              })()}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}>
            <span style={{ fontSize: 13, color: colors.labelMuted }}>Watching:</span>
            <select value={watchedStudent} onChange={(e) => setWatchedStudent(e.target.value)} style={selectPlainStyle}>
              <option value="">None</option>
              {watchOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
        <Link to="/admin/bot-activity" style={{ fontSize: 13, color: colors.rotateBlue, textDecoration: 'none' }}>
          Bot activity →
        </Link>
        <Link to="/admin/timetable" style={{ fontSize: 13, color: colors.rotateBlue, textDecoration: 'none' }}>
          Manage weekly timetable →
        </Link>
      </div>
    </div>
  );
}

function SeatBox({
  idx,
  name,
  locked,
  spotlight,
  flash,
  onRef,
  onSwap
}: {
  idx: number;
  name: string;
  locked: boolean;
  spotlight: boolean;
  flash: boolean;
  onRef: (el: HTMLDivElement | null) => void;
  onSwap: (from: number, to: number) => void;
}) {
  const bg = spotlight ? colors.spotlightBg : locked ? colors.lockedBg : flash ? colors.flashBg : colors.tableBg;
  const border = spotlight ? colors.spotlightBorder : locked ? colors.lockedBorder : flash ? colors.flashBorder : colors.borderDash;
  return (
    <div
      ref={onRef}
      draggable={!!name}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(idx));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isNaN(from) && from !== idx) onSwap(from, idx);
      }}
      style={{
        flex: 1,
        minHeight: 56,
        border: `1px dashed ${border}`,
        background: bg,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        fontSize: 14,
        textAlign: 'center',
        color: name ? colors.text : colors.textPlaceholder,
        transition: 'background 0.4s, border-color 0.4s',
        cursor: name ? 'grab' : 'default',
        userSelect: 'none'
      }}
    >
      {name || '—'}
    </div>
  );
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    login: 'signed in',
    logout: 'signed out',
    login_failed: 'failed sign-in attempt',
    login_locked_out: 'locked out after failed attempts',
    roster_locked: 'locked the roster',
    roster_unlocked: 'unlocked the roster',
    shuffle: 'ran a random shuffle',
    rotate_seats: 'rotated seats',
    shuffle_pairs: 'shuffled fixed pairs',
    add_fixed_pair: 'added a fixed pair',
    remove_fixed_pair: 'removed a fixed pair',
    clear_history: 'cleared seating history',
    save_default: 'saved default seating',
    reset_default: 'reset to default seating',
    add_locked_seat: 'pinned a seat',
    remove_locked_seat: 'removed a seat pin',
    add_keep_apart: 'added a keep-apart rule',
    remove_keep_apart: 'removed a keep-apart rule',
    restore_history: 'restored a past arrangement',
    swap_seats: 'swapped two seats',
    create_admin: 'created an admin account',
    remove_admin: 'removed an admin account'
  };
  return map[action] || action;
}

const sectionLabelStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: colors.textMuted,
  marginBottom: 2
};

const sectionTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 4 };
const sectionHintStyle: CSSProperties = { fontSize: 12, color: colors.textMuted, marginBottom: 10 };
const sectionBlockStyle: CSSProperties = { borderTop: `1px solid ${colors.borderSoft}`, paddingTop: 16, marginTop: 4 };

const rosterInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '7px 8px',
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  fontFamily: 'inherit',
  fontSize: 13,
  color: colors.text,
  background: '#fff',
  boxSizing: 'border-box'
};

const primaryButtonStyle: CSSProperties = {
  padding: 12,
  border: 'none',
  borderRadius: 8,
  background: colors.text,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer'
};

const secondaryButtonStyle: CSSProperties = {
  padding: '10px 16px',
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: '#fff',
  color: colors.text,
  fontSize: 14,
  cursor: 'pointer'
};

const linkButtonStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  color: colors.text,
  fontSize: 12,
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0
};

const ruleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderBottom: `1px solid ${colors.borderHair}`,
  fontSize: 13
};

const removeButtonStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  color: colors.textFaint,
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1
};

const restoreButtonStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  background: '#fff',
  color: colors.text,
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 6,
  cursor: 'pointer'
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

const selectFlexStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '7px 4px',
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  fontSize: 13,
  background: '#fff',
  color: colors.text
};

const selectNarrowStyle: CSSProperties = { ...selectFlexStyle, flex: 'none', width: 60 };
const selectTinyStyle: CSSProperties = { ...selectFlexStyle, flex: 'none', width: 48 };
const selectPlainStyle: CSSProperties = {
  padding: '6px 8px',
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  fontSize: 13,
  background: '#fff',
  color: colors.text
};
