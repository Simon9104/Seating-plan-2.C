import { FormEvent, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, setCsrfToken } from '../api/client';
import { colors, fontFamily } from '../theme';

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
        width: '100%',
        minHeight: '100vh',
        background: colors.pageBg,
        fontFamily,
        color: colors.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box'
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 340,
          border: `2px solid ${colors.borderSoft}`,
          borderRadius: 16,
          padding: '32px 28px',
          background: colors.cardBg,
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.textMuted,
              marginBottom: 4
            }}
          >
            Admin
          </div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Sign in</div>
        </div>

        <label style={{ fontSize: 13, color: colors.labelMuted, display: 'flex', flexDirection: 'column', gap: 6 }}>
          Username
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={{ fontSize: 13, color: colors.labelMuted, display: 'flex', flexDirection: 'column', gap: 6 }}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        {error && <div style={{ fontSize: 13, color: colors.danger }}>{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: 4,
            padding: 12,
            border: 'none',
            borderRadius: 8,
            background: colors.text,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting ? 'default' : 'pointer',
            opacity: submitting ? 0.7 : 1
          }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  padding: '9px 10px',
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  fontFamily: 'inherit',
  fontSize: 14,
  color: colors.text,
  background: '#fff',
  boxSizing: 'border-box'
};
