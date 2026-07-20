import { FormEvent, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, setCsrfToken } from '../api/client';

// Dark glass-card look (adapted from a "modern-stunning-sign-in" UI
// reference) rewritten with inline styles for this project (no Tailwind
// here) and wired to the real /api/auth/login flow. Dropped from the
// original reference: email-format validation (admin accounts use
// usernames, not emails), the "Continue with Google" button (no OAuth is
// implemented), the "Sign up" link (admins are created internally, not via
// public signup), and all externally-hosted images (would be blocked by
// this site's img-src 'self' CSP anyway, and leak visitor data to those
// third parties on every page load).

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
        background: '#121212',
        fontFamily: 'Helvetica, Arial, sans-serif',
        padding: 24,
        boxSizing: 'border-box'
      }}
    >
      <style>{`
        .signin-input::placeholder { color: rgba(255,255,255,0.4); }
        .signin-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(255,255,255,0.35); }
        .signin-btn-primary:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
      `}</style>

      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.06), #121212)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)'
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="7" height="7" rx="1.5" stroke="#fff" strokeWidth="1.6" />
            <rect x="14" y="4" width="7" height="7" rx="1.5" stroke="#fff" strokeWidth="1.6" />
            <rect x="3" y="15" width="7" height="5" rx="1.5" stroke="#fff" strokeWidth="1.6" />
            <rect x="14" y="15" width="7" height="5" rx="1.5" stroke="#fff" strokeWidth="1.6" />
          </svg>
        </div>

        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
          Admin
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: '0 0 24px' }}>Sign in</h2>

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
          {error && <div style={{ fontSize: 13, color: '#f87171' }}>{error}</div>}

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '4px 0' }} />

          <button
            type="submit"
            disabled={submitting}
            className="signin-btn-primary"
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 999,
              border: 'none',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'background 0.15s'
            }}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </div>

        <div style={{ marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
          Students never see this page.
        </div>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  fontFamily: 'inherit',
  fontSize: 14
};
