// SHELL-011: Log Out in the dashboard menu explains a failure instead of
// leaving the user signed in without a word, and never leaves an unhandled
// rejection. Uses the real provider, guards and DashboardLayout; Firebase and
// the API are fakes, and all data is synthetic.
import process from 'node:process';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => (await import('./support/fakeFirebase.js')).appModule());
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

import { AuthProvider } from '../src/context/AuthProvider.jsx';
import DashboardLayout from '../src/layouts/DashboardLayout.jsx';
import Login from '../src/pages/auth/Login.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import RedirectIfAuth from '../src/routes/RedirectIfAuth.jsx';
import { api, callsTo, deferred, reply, seen, settle, setUpSignInTest, tearDownSignInTest } from './support/authHarness.jsx';
import { firebase, setCurrentUser } from './support/fakeFirebase.js';

const MENU_FAILED = 'You could not be logged out. Check your connection, then try again.';
const NOT_CONFIRMED = 'You are signed out on this device, but the server could not confirm it.';

const unhandled = vi.fn();

beforeEach(() => {
  setUpSignInTest();
  localStorage.clear();
  unhandled.mockReset();
  process.on('unhandledRejection', unhandled);
});

afterEach(async () => {
  await settle();
  process.off('unhandledRejection', unhandled);
  tearDownSignInTest();
  expect(unhandled).not.toHaveBeenCalled();
});

function LocationProbe() {
  const { pathname } = useLocation();
  seen.locations.push(pathname);
  return null;
}

async function openDashboard() {
  firebase.auth.currentUser = firebase.nextUser;
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <LocationProbe />
      <AuthProvider>
        <Routes>
          <Route element={<RedirectIfAuth />}>
            <Route path="/auth/login" element={<Login />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<p>Synthetic dashboard page</p>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await settle();
  expect(screen.getByText('Synthetic dashboard page')).toBeInTheDocument();
}

const openMenu = () => act(async () => {
  fireEvent.click(document.querySelector('.user-chip'));
});

async function logOutFromMenu() {
  await openMenu();
  await act(async () => {
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Log Out' }));
  });
  await settle();
}

const failFirebase = () => {
  firebase.signOut = vi.fn(async () => { throw new Error('synthetic Firebase sign-out failure'); });
};
const failServer = () => {
  api.logout = async () => { throw new TypeError('synthetic network failure'); };
};

describe('SHELL-011: Log Out in the dashboard menu', () => {
  it('opens the sign-in page after a successful logout', async () => {
    await openDashboard();

    await logOutFromMenu();

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(seen.locations.at(-1)).toBe('/auth/login');
  });

  it.each([
    ['Firebase sign-out fails', failFirebase],
    ['both Firebase and the server fail', () => { failFirebase(); failServer(); }],
  ])('shows an alert and stays on the dashboard when %s', async (_label, fail) => {
    await openDashboard();
    fail();

    await logOutFromMenu();

    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser.uid).toBe('uid-one');
    expect(screen.getByRole('alert')).toHaveTextContent(MENU_FAILED);
    expect(screen.getByText('Synthetic dashboard page')).toBeInTheDocument();
    expect(seen.locations.at(-1)).toBe('/dashboard');
    // The menu closed and can be used again.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await openMenu();
    expect(screen.getByRole('menuitem', { name: 'Log Out' })).toBeEnabled();
  });

  it('opens the sign-in page, which explains, when only the server logout fails', async () => {
    await openDashboard();
    failServer();

    await logOutFromMenu();

    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser).toBeNull();
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(NOT_CONFIRMED);
    expect(screen.queryByText(MENU_FAILED)).not.toBeInTheDocument();
    expect(seen.locations.at(-1)).toBe('/auth/login');
  });

  it('drops the alert on the next attempt, which can succeed', async () => {
    await openDashboard();
    failFirebase();
    await logOutFromMenu();
    expect(screen.getByRole('alert')).toHaveTextContent(MENU_FAILED);

    firebase.signOut = vi.fn(async () => setCurrentUser(null));
    await logOutFromMenu();

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByText(MENU_FAILED)).not.toBeInTheDocument();
    expect(callsTo('/logout')).toHaveLength(2);
  });

  it('shows Logging out... and disables the item while the logout runs', async () => {
    await openDashboard();
    const held = deferred();
    api.logout = () => held.promise;

    await openMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Log Out' }));
    });

    expect(screen.getByRole('menuitem', { name: 'Logging out...' })).toBeDisabled();

    await act(async () => held.resolve(reply(204)));
    await settle();
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });
});
