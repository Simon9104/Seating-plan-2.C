import { FormEvent, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, setCsrfToken } from '../api/client';
import { colors, fontFamily } from '../theme';

// Matches the admin panel's own look (see theme.ts / AdminPanel.tsx) rather
// than having its own separate style, so the login page doesn't feel like a
// different site from the panel it leads into.

export default function AdminLogin({ onLoggedIn }: { onLoggedIn: (admin: { username: string; displayName: string }) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await api.login(username.trim(), password);
      setCsrfToken(result.csrfToken);
      onLoggedIn(result.admin);
      navigate('/admin');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.pageBg,
        fontFamily,
        padding: 24,
        boxSizing: 'border-box'
      }}
    >
      <style>{`
        .signin-input { transition: border-color 0.15s, box-shadow 0.15s; }
        .signin-input::placeholder { color: ${colors.textPlaceholder}; }
        .signin-input:focus { outline: none; border-color: ${colors.text}; }
        .signin-btn-primary:hover:not(:disabled) { opacity: 0.9; }
        .signin-btn-primary:active:not(:disabled) { transform: translateY(1px); }
      `}</style>

      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 340,
          borderRadius: 16,
          border: `2px solid ${colors.borderSoft}`,
          background: colors.cardBg,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          padding: '32px 32px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: colors.defaultEnabledBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="7" height="7" rx="1.5" stroke={colors.text} strokeWidth="1.6" />
            <rect x="14" y="4" width="7" height="7" rx="1.5" stroke={colors.text} strokeWidth="1.6" />
            <rect x="3" y="15" width="7" height="5" rx="1.5" stroke={colors.text} strokeWidth="1.6" />
            <rect x="14" y="15" width="7" height="5" rx="1.5" stroke={colors.text} strokeWidth="1.6" />
          </svg>
        </div>

        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textMuted, marginBottom: 4 }}>
          Admin
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: colors.text, margin: '0 0 22px' }}>Sign in</h2>

        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 12 }}>
          <input
            className="signin-input"
            placeholder="Username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            className="signin-input"
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
          {error && <div style={{ fontSize: 13, color: colors.danger }}>{error}</div>}

          <hr style={{ border: 'none', borderTop: `1px solid ${colors.borderHair}`, margin: '4px 0' }} />

          <button type="submit" disabled={submitting} className="signin-btn-primary" style={buttonStyle(submitting)}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </div>

        <div style={{ marginTop: 18, fontSize: 12, color: colors.textFaint, textAlign: 'center' }}>
          Students never see this page.
        </div>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 6,
  border: `1px solid ${colors.border}`,
  background: '#fff',
  color: colors.text,
  fontFamily: 'inherit',
  fontSize: 14
};

function buttonStyle(submitting: boolean): CSSProperties {
  return {
    width: '100%',
    padding: 12,
    border: 'none',
    borderRadius: 8,
    background: colors.text,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: submitting ? 'default' : 'pointer',
    opacity: submitting ? 0.7 : 1,
    transition: 'opacity 0.15s, transform 0.1s'
  };
}
