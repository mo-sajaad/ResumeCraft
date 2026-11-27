// IDENTITY-021: Remember me, the saved deep link, and the terms box for Google
// sign-up. Firebase and the auth context are mocked; all data is synthetic.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

const authState = vi.hoisted(() => ({ value: null }));

vi.mock('../src/firebase', () => ({ auth: { name: 'synthetic-auth' }, hasFirebaseConfig: true }));
vi.mock('../src/context/useAuth', () => ({ useAuth: () => authState.value }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  browserLocalPersistence: { type: 'LOCAL' },
  browserSessionPersistence: { type: 'SESSION' },
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  updateProfile: vi.fn(),
}));

import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithPopup,
} from 'firebase/auth';
import Login from '../src/pages/auth/Login.jsx';
import Signup from '../src/pages/auth/Signup.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import RedirectIfAuth from '../src/routes/RedirectIfAuth.jsx';

const signedOut = { user: null, loading: false, sessionStatus: 'idle', needsEmailVerification: false };
const signedIn = { ...signedOut, user: { uid: 'uid-one' }, sessionStatus: 'ready' };

beforeEach(() => {
  authState.value = { ...signedOut, completeSignUp: vi.fn(), prepareGoogleSignUp: vi.fn() };
  vi.mocked(setPersistence).mockReset();
  vi.mocked(signInWithPopup).mockReset();
});

function Where() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function app(initialEntry) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Where />
      <Routes>
        <Route element={<RedirectIfAuth />}>
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/signup" element={<Signup />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<p>dashboard</p>} />
          <Route path="/dashboard/resumes" element={<p>resumes</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const location = () => screen.getByLabelText('location').textContent;

describe('Remember me', () => {
  it.each([
    ['checked (the default)', false, browserLocalPersistence],
    ['unchecked', true, browserSessionPersistence],
  ])('when %s, Google sign-in uses the matching persistence', async (_label, untick, expected) => {
    render(app('/auth/login'));
    if (untick) fireEvent.click(screen.getByLabelText('Remember me'));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /continue with google/i })); });

    expect(setPersistence).toHaveBeenCalledWith(expect.anything(), expected);
  });
});

describe('saved deep link', () => {
  it('opens the page ProtectedRoute saved once the session is ready', () => {
    const view = render(app('/dashboard/resumes?id=synthetic#top'));
    expect(location()).toBe('/auth/login');

    authState.value = { ...authState.value, ...signedIn };
    view.rerender(app('/ignored'));

    expect(location()).toBe('/dashboard/resumes?id=synthetic#top');
  });

  it.each([
    ['protocol-relative', '//evil.test/x'],
    ['backslash', '/\\evil.test'],
    ['another sign-in page', '/auth/signup'],
    ['not starting with a slash', 'https://evil.test/'],
  ])('falls back to /dashboard for a %s path', (_label, pathname) => {
    authState.value = { ...authState.value, ...signedIn };
    render(app({ pathname: '/auth/login', state: { from: { pathname } } }));

    expect(location()).toBe('/dashboard');
  });
});

describe('Google sign-up and the terms box', () => {
  it('does not open Google until the terms are accepted', async () => {
    render(app('/auth/signup'));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /continue with google/i })); });

    expect(signInWithPopup).not.toHaveBeenCalled();
    expect(screen.getByText(/please accept the terms/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/i agree to the/i));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /continue with google/i })); });
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
  });
});
