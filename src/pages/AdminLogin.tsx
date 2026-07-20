import { FormEvent, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, setCsrfToken } from '../api/client';

// "Liquid glass" look: a dark backdrop with soft, slowly-drifting colored
// light behind a frosted (backdrop-blur) card, glass-morphism inputs/button,
// and a glossy highlight across the top of the card. Everything here is
// pure CSS (gradients, blur, animation) — no images, so nothing for this
// site's img-src 'self' CSP to block and nothing loaded from a third party.
// Wired to the real /api/auth/login flow (see AdminPanel/App for the rest
// of the session lifecycle).

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
        position: 'relative',
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#08080c',
        fontFamily: 'Helvetica, Arial, sans-serif',
        padding: 24,
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <style>{`
        @keyframes liquidDriftA { 0%,100% { transform: translate(-8%, -6%) scale(1); } 50% { transform: translate(6%, 8%) scale(1.15); } }
        @keyframes liquidDriftB { 0%,100% { transform: translate(10%, 4%) scale(1.05); } 50% { transform: translate(-6%, -10%) scale(1); } }
        @keyframes liquidDriftC { 0%,100% { transform: translate(0%, 10%) scale(1); } 50% { transform: translate(-8%, -4%) scale(1.1); } }
        @media (prefers-reduced-motion: reduce) {
          .liquid-blob { animation: none !important; }
        }
        .signin-input { transition: background 0.15s, border-color 0.15s, box-shadow 0.15s; }
        .signin-input::placeholder { color: rgba(255,255,255,0.38); }
        .signin-input:focus { outline: none; background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.4); box-shadow: 0 0 0 3px rgba(120,170,255,0.18); }
        .signin-btn-primary:hover:not(:disabled) { background: rgba(255,255,255,0.28); transform: translateY(-1px); }
        .signin-btn-primary:active:not(:disabled) { transform: translateY(0); }
      `}</style>

      {/* Soft colored light drifting behind the glass — this is what makes
          the blur on the card actually look like it's refracting something. */}
      <div
        className="liquid-blob"
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-10%',
          width: '55vw',
          height: '55vw',
          maxWidth: 560,
          maxHeight: 560,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.55), transparent 70%)',
          filter: 'blur(60px)',
          animation: 'liquidDriftA 22s ease-in-out infinite'
        }}
      />
      <div
        className="liquid-blob"
        style={{
          position: 'absolute',
          bottom: '-15%',
          right: '-10%',
          width: '50vw',
          height: '50vw',
          maxWidth: 520,
          maxHeight: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56,189,248,0.5), transparent 70%)',
          filter: 'blur(60px)',
          animation: 'liquidDriftB 26s ease-in-out infinite'
        }}
      />
      <div
        className="liquid-blob"
        style={{
          position: 'absolute',
          top: '30%',
          right: '15%',
          width: '32vw',
          height: '32vw',
          maxWidth: 360,
          maxHeight: 360,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(236,72,153,0.35), transparent 70%)',
          filter: 'blur(70px)',
          animation: 'liquidDriftC 30s ease-in-out infinite'
        }}
      />

      <form
        onSubmit={submit}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 360,
          borderRadius: 28,
          background: 'linear-gradient(165deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.08))',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.25)',
          boxShadow: '0 25px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 0 40px rgba(255,255,255,0.03)',
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
            background: 'linear-gradient(160deg, rgba(255,255,255,0.35), rgba(255,255,255,0.08))',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            boxShadow: '0 4px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)'
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="7" height="7" rx="1.5" stroke="#fff" strokeWidth="1.6" />
            <rect x="14" y="4" width="7" height="7" rx="1.5" stroke="#fff" strokeWidth="1.6" />
            <rect x="3" y="15" width="7" height="5" rx="1.5" stroke="#fff" strokeWidth="1.6" />
            <rect x="14" y="15" width="7" height="5" rx="1.5" stroke="#fff" strokeWidth="1.6" />
          </svg>
        </div>

        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
          Admin
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: '0 0 24px', textShadow: '0 1px 12px rgba(0,0,0,0.25)' }}>
          Sign in
        </h2>

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
          {error && <div style={{ fontSize: 13, color: '#fca5a5' }}>{error}</div>}

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.15)', margin: '4px 0' }} />

          <button
            type="submit"
            disabled={submitting}
            className="signin-btn-primary"
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'linear-gradient(160deg, rgba(255,255,255,0.32), rgba(255,255,255,0.12))',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              boxShadow: '0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
              transition: 'background 0.15s, transform 0.15s'
            }}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </div>

        <div style={{ marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
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
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.07)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  color: '#fff',
  fontFamily: 'inherit',
  fontSize: 14
};
