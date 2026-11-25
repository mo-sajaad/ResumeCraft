import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { AuthProvider } from '../../src/context/AuthProvider.jsx';
import { useAuth } from '../../src/context/useAuth';
import Login from '../../src/pages/auth/Login.jsx';
import Signup from '../../src/pages/auth/Signup.jsx';
import ProtectedRoute from '../../src/routes/ProtectedRoute.jsx';
import RedirectIfAuth from '../../src/routes/RedirectIfAuth.jsx';

function Dashboard({ onMount }) {
  const { profile, logout, refreshProfile } = useAuth();
  const [refreshFailed, setRefreshFailed] = useState(false);

  useEffect(() => onMount(), [onMount]);

  return (
    <main aria-label="Dashboard">
      <p data-testid="profile">{profile ? `${profile.firebase_uid}: ${profile.full_name}` : 'no profile'}</p>
      {refreshFailed ? <p>Refresh failed</p> : null}
      <button type="button" onClick={() => refreshProfile().catch(() => setRefreshFailed(true))}>Refresh</button>
      <button type="button" onClick={logout}>Sign out</button>
    </main>
  );
}

function LocationProbe({ onChange }) {
  const { pathname } = useLocation();
  useEffect(() => onChange(pathname), [onChange, pathname]);
  return null;
}

// The real provider, guards and sign-in pages around a stand-in dashboard.
export default function TestApp({ path, onDashboardMount, onLocation }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe onChange={onLocation} />
      <AuthProvider>
        <Routes>
          <Route element={<RedirectIfAuth />}>
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/signup" element={<Signup />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard onMount={onDashboardMount} />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}
