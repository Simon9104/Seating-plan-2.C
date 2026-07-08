import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import SeatingChart from './pages/SeatingChart';
import AdminLogin from './pages/AdminLogin';
import AdminPanel from './pages/AdminPanel';
import { api, setCsrfToken } from './api/client';
import { colors, fontFamily } from './theme';

type Admin = { username: string; displayName: string };

export default function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setCsrfToken(r.csrfToken);
        setAdmin(r.admin);
      })
      .catch(() => setAdmin(null))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return (
      <div style={{ padding: 40, fontFamily, color: colors.textMuted, background: colors.pageBg, minHeight: '100vh' }}>
        Loading…
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<SeatingChart />} />
      <Route
        path="/admin/login"
        element={
          admin ? <Navigate to="/admin" replace /> : <AdminLogin onLoggedIn={(a) => setAdmin(a)} />
        }
      />
      <Route
        path="/admin"
        element={
          admin ? (
            <AdminPanel admin={admin} onLoggedOut={() => setAdmin(null)} />
          ) : (
            <Navigate to="/admin/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
