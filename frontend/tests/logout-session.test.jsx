// IDENTITY-012: logout always signs out of Firebase, even when the server
// logout fails, and says so; no exchange for that user can start until it has
// finished. Uses the real utils/auth, provider, guards and Settings page;
// Firebase and the API are fakes, and all data is synthetic.
import process from 'node:process';
import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => ({
  ...(await import('./support/fakeFirebase.js')).appModule(),
  updatePassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

import { AuthProvider } from '../src/context/AuthProvider.jsx';
import { useAuth } from '../src/context/useAuth';
import Login from '../src/pages/auth/Login.jsx';
import Settings from '../src/pages/Settings.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import RedirectIfAuth from '../src/routes/RedirectIfAuth.jsx';
import {
  LOGGING_OUT,
  SERVER_LOGOUT_FAILED,
  SESSION_REQUEST_TIMEOUT_MS,
  exchangeFirebaseTokenForJwt,
  getAuthToken,
  logoutSession,
} from '../src/utils/auth';
import { api, callsTo, deferred, reply, seen, settle, setUpSignInTest, tearDownSignInTest } from './support/authHarness.jsx';
import { createUser, firebase, setCurrentUser } from './support/fakeFirebase.js';

const NOT_CONFIRMED = 'You are signed out on this device, but the server could not confirm it. '
  + 'On a shared device, sign in and sign out again.';
const SETTINGS_FAILED = 'You could not be signed out. Check your connection, then try again.';

const unhandled = vi.fn();

beforeEach(() => {
  setUpSignInTest();
  unhandled.mockReset();
  process.on('unhandledRejection', unhandled);
});

afterEach(async () => {
  vi.useRealTimers();
  await settle();
  process.off('unhandledRejection', unhandled);
  tearDownSignInTest();
  expect(unhandled).not.toHaveBeenCalled();
});

const context = { current: null };

// Hands the latest auth context to the test after each render.
function ContextProbe() {
  const value = useAuth();
  useEffect(() => { context.current = value; });
  return null;
}

function LocationProbe() {
  const { pathname } = useLocation();
  seen.locations.push(pathname);
  return null;
}

// The provider, guards, sign-in page and Settings for a returning user.
async function openApp(path = '/dashboard') {
  firebase.auth.currentUser = firebase.nextUser;
  render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <AuthProvider>
        <ContextProbe />
        <Routes>
          <Route element={<RedirectIfAuth />}>
            <Route path="/auth/login" element={<Login />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<main aria-label="Dashboard" />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await settle();
  expect(context.current.sessionStatus).toBe('ready');
}

async function logOut() {
  let outcome;
  await act(async () => {
    outcome = await context.current.logout().then(() => null, (error) => error);
  });
  return outcome;
}

const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

describe('IDENTITY-012: logout from the provider', () => {
  it('signs out of Firebase and the server when both succeed', async () => {
    await openApp();

    expect(await logOut()).toBeNull();

    expect(callsTo('/logout')).toHaveLength(1);
    expect(callsTo('/logout')[0][1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser).toBeNull();
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['a network error', () => { api.logout = async () => { throw new TypeError('synthetic network failure'); }; }],
    ['a 500', () => { api.logout = async () => reply(500, { message: 'synthetic failure' }); }],
    ['a 401', () => { api.logout = async () => reply(401, { message: 'synthetic refusal' }); }],
  ])('still signs out of Firebase after %s, rejects with SERVER_LOGOUT_FAILED and explains', async (_label, fail) => {
    await openApp();
    fail();

    const error = await logOut();

    expect(error.code).toBe(SERVER_LOGOUT_FAILED);
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser).toBeNull();
    expect(context.current.user).toBeNull();
    expect(context.current.profile).toBeNull();
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(NOT_CONFIRMED);
    expect(seen.locations.at(-1)).toBe('/auth/login');
  });

  it('still signs out of Firebase when the logout request times out', async () => {
    await openApp();
    api.logout = () => new Promise(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let outcome;
    const pending = context.current.logout().then(() => null, (error) => error);
    pending.then((error) => { outcome = error; });
    await act(() => vi.advanceTimersByTimeAsync(SESSION_REQUEST_TIMEOUT_MS - 1));
    expect(outcome).toBeUndefined();
    expect(firebase.signOut).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(async () => { await pending; });

    expect(outcome.code).toBe(SERVER_LOGOUT_FAILED);
    expect(callsTo('/logout')[0][1].signal.aborted).toBe(true);
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(NOT_CONFIRMED);
  });

  it.each([
    ['the server logout succeeds', () => {}],
    ['the server logout fails too', () => { api.logout = async () => { throw new TypeError('synthetic network failure'); }; }],
  ])('rejects with the Firebase error and keeps the user signed in when Firebase sign-out fails and %s', async (_label, failServer) => {
    await openApp();
    failServer();
    const firebaseError = new Error('synthetic Firebase sign-out failure');
    firebase.signOut = vi.fn(async () => { throw firebaseError; });

    const error = await logOut();

    expect(error).toBe(firebaseError);
    expect(error.code).not.toBe(SERVER_LOGOUT_FAILED);
    expect(firebase.auth.currentUser.uid).toBe('uid-one');
    expect(context.current.user.uid).toBe('uid-one');
    expect(context.current.profile).not.toBeNull();
    expect(screen.queryByText(NOT_CONFIRMED)).not.toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('can be signed out again after Firebase sign-out failed once', async () => {
    await openApp();
    firebase.signOut = vi.fn()
      .mockRejectedValueOnce(new Error('synthetic Firebase sign-out failure'))
      .mockImplementation(async () => setCurrentUser(null));

    expect(await logOut()).toBeInstanceOf(Error);
    expect(await logOut()).toBeNull();

    expect(firebase.auth.currentUser).toBeNull();
    expect(callsTo('/logout')).toHaveLength(2);
  });
});

describe('IDENTITY-012: logoutSession and exchanges', () => {
  beforeEach(() => {
    firebase.auth.currentUser = createUser('uid-one');
  });

  it('refuses an exchange for the same user with LOGGING_OUT until it has finished, then allows it', async () => {
    const heldLogout = deferred();
    const heldFirebase = deferred();
    api.logout = () => heldLogout.promise;
    const signOutOfFirebase = vi.fn(() => heldFirebase.promise);

    const logout = logoutSession('uid-one', signOutOfFirebase);
    await flush();

    // While the server logout runs.
    await expect(exchangeFirebaseTokenForJwt()).rejects.toMatchObject({ code: LOGGING_OUT });
    await expect(getAuthToken()).rejects.toMatchObject({ code: LOGGING_OUT });

    heldLogout.resolve(reply(204));
    await flush();
    expect(signOutOfFirebase).toHaveBeenCalledTimes(1);
    // While Firebase signs out.
    await expect(exchangeFirebaseTokenForJwt()).rejects.toMatchObject({ code: LOGGING_OUT });
    expect(callsTo('/exchange')).toEqual([]);

    heldFirebase.resolve();
    await logout;

    await expect(exchangeFirebaseTokenForJwt()).resolves.toBe('cookie_session');
    expect(callsTo('/exchange')).toHaveLength(1);
  });

  it('allows the exchange again after a logout that failed on the server', async () => {
    api.logout = async () => { throw new TypeError('synthetic network failure'); };

    await expect(logoutSession('uid-one')).rejects.toMatchObject({ code: SERVER_LOGOUT_FAILED });

    await expect(exchangeFirebaseTokenForJwt()).resolves.toBe('cookie_session');
  });

  it('allows the exchange again after Firebase sign-out failed', async () => {
    const firebaseError = new Error('synthetic Firebase sign-out failure');

    await expect(logoutSession('uid-one', async () => { throw firebaseError; })).rejects.toBe(firebaseError);

    await expect(exchangeFirebaseTokenForJwt()).resolves.toBe('cookie_session');
  });

  it('keeps refusing while a second logout of the same user is still running', async () => {
    const first = deferred();
    const second = deferred();
    const answers = [first, second];
    api.logout = () => answers.shift().promise;

    const logoutOne = logoutSession('uid-one');
    const logoutTwo = logoutSession('uid-one');
    await flush();
    first.resolve(reply(204));
    await logoutOne;

    await expect(exchangeFirebaseTokenForJwt()).rejects.toMatchObject({ code: LOGGING_OUT });

    second.resolve(reply(204));
    await logoutTwo;
    await expect(exchangeFirebaseTokenForJwt()).resolves.toBe('cookie_session');
  });

  it('waits for an exchange of the same user that is already on its way', async () => {
    const heldExchange = deferred();
    api.exchange = () => heldExchange.promise;
    const signOutOfFirebase = vi.fn(async () => {});

    const exchange = exchangeFirebaseTokenForJwt();
    await flush();
    const logout = logoutSession('uid-one', signOutOfFirebase);
    await flush();
    expect(callsTo('/logout')).toEqual([]);
    expect(signOutOfFirebase).not.toHaveBeenCalled();

    heldExchange.resolve(reply(200));
    await exchange;
    await logout;

    const order = globalThis.fetch.mock.calls.map(([url]) => url);
    expect(order).toEqual(['/api/auth/exchange', '/api/auth/logout']);
    expect(signOutOfFirebase).toHaveBeenCalledTimes(1);
    // The cookie from that exchange was ended, so the next request exchanges again.
    api.exchange = async () => reply(200);
    await getAuthToken();
    expect(callsTo('/exchange')).toHaveLength(2);
  });

  it('still logs out when the exchange it waited for fails', async () => {
    const heldExchange = deferred();
    api.exchange = () => heldExchange.promise;

    const exchange = exchangeFirebaseTokenForJwt().catch((error) => error);
    await flush();
    const logout = logoutSession('uid-one');
    heldExchange.resolve(reply(500, { message: 'synthetic failure' }));

    expect((await exchange).status).toBe(500);
    await expect(logout).resolves.toBeUndefined();
    expect(callsTo('/logout')).toHaveLength(1);
  });

  it('lets another user exchange while the logout is pending', async () => {
    const heldLogout = deferred();
    api.logout = () => heldLogout.promise;

    const logout = logoutSession('uid-one');
    await flush();
    firebase.auth.currentUser = createUser('uid-two');

    await expect(exchangeFirebaseTokenForJwt()).resolves.toBe('cookie_session');
    expect(seen.exchanges.map(({ uid }) => uid)).toEqual(['uid-two']);

    heldLogout.resolve(reply(204));
    await logout;
  });

  it('does not wait for an exchange of another user', async () => {
    const heldExchange = deferred();
    api.exchange = () => heldExchange.promise;
    firebase.auth.currentUser = createUser('uid-two');
    const exchange = exchangeFirebaseTokenForJwt();
    await flush();

    await expect(logoutSession('uid-one')).resolves.toBeUndefined();
    expect(callsTo('/logout')).toHaveLength(1);

    heldExchange.resolve(reply(200));
    await exchange;
  });
});

describe('IDENTITY-012: Log out in Settings', () => {
  const clickLogOut = () => act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  });

  it('opens the sign-in page after a successful logout', async () => {
    await openApp('/settings');

    await clickLogOut();
    await settle();

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(seen.locations.at(-1)).toBe('/auth/login');
  });

  it('opens the sign-in page with the explanation when only the server logout fails', async () => {
    await openApp('/settings');
    api.logout = async () => { throw new TypeError('synthetic network failure'); };

    await clickLogOut();
    await settle();

    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(NOT_CONFIRMED);
    expect(seen.locations.at(-1)).toBe('/auth/login');
  });

  it('stays on Settings and explains when Firebase sign-out fails', async () => {
    await openApp('/settings');
    firebase.signOut = vi.fn(async () => { throw new Error('synthetic Firebase sign-out failure'); });

    await clickLogOut();
    await settle();

    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser.uid).toBe('uid-one');
    expect(screen.getByText(SETTINGS_FAILED)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(seen.locations.at(-1)).toBe('/settings');
  });
});
