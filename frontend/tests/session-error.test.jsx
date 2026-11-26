// IDENTITY-009: the could-not-load-your-account panel (SessionError) and when
// the guards show it. Firebase and the API are fakes; all data is synthetic.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => (await import('./support/fakeFirebase.js')).appModule());
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

import { AuthContext } from '../src/context/AuthContext.jsx';
import SessionError from '../src/routes/SessionError.jsx';
import {
  api,
  callsTo,
  click,
  deferred,
  profileText,
  renderApp,
  reply,
  seen,
  settle,
  setUpSignInTest,
  submitLogin,
  tearDownSignInTest,
} from './support/authHarness.jsx';
import { firebase, setCurrentUser } from './support/fakeFirebase.js';

const PANEL = /could not load your account/i;
const SIGN_OUT_FAILED = 'You could not be signed out. Check your connection and try again.';
const USUAL = 'This is usually temporary. Check your connection, then try again.';

beforeEach(setUpSignInTest);
afterEach(tearDownSignInTest);

const dashboard = () => screen.queryByRole('main', { name: 'Dashboard' });
const lastLocation = () => seen.locations.at(-1);

async function findPanel() {
  const panel = await screen.findByRole('alert');
  expect(panel).toHaveTextContent(PANEL);
  return panel;
}

// Signs in on the login page with an exchange that fails with `status`.
async function signInWithFailingExchange(status = 500) {
  api.exchange = async () => reply(status, { message: 'synthetic failure' });
  renderApp('/auth/login');
  await submitLogin();
  return findPanel();
}

describe('IDENTITY-009: SessionError buttons', () => {
  function renderPanel(value) {
    return render(
      <AuthContext.Provider value={value}>
        <SessionError />
      </AuthContext.Provider>
    );
  }

  const buttons = () => ({
    retry: screen.getByRole('button', { name: /retry|please wait/i }),
    signOut: screen.getByRole('button', { name: 'Sign out' }),
  });

  it('disables both buttons and says Please wait... while Retry runs', async () => {
    const pending = deferred();
    const retrySession = vi.fn(() => pending.promise);
    renderPanel({ retrySession, logout: vi.fn() });

    await click('Retry');

    expect(retrySession).toHaveBeenCalledTimes(1);
    expect(buttons().retry).toHaveTextContent('Please wait...');
    expect(buttons().retry).toBeDisabled();
    expect(buttons().signOut).toBeDisabled();

    await act(async () => pending.resolve());

    expect(buttons().retry).toHaveTextContent('Retry');
    expect(buttons().retry).toBeEnabled();
    expect(buttons().signOut).toBeEnabled();
  });

  it('disables both buttons while Sign out runs', async () => {
    const pending = deferred();
    const logout = vi.fn(() => pending.promise);
    renderPanel({ retrySession: vi.fn(), logout });

    await click('Sign out');

    expect(logout).toHaveBeenCalledTimes(1);
    expect(buttons().retry).toBeDisabled();
    expect(buttons().signOut).toBeDisabled();

    await act(async () => pending.resolve());

    expect(buttons().signOut).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent(USUAL);
  });

  it('shows why after a failed Sign out, and drops it on the next attempt', async () => {
    const logout = vi.fn(async () => { throw new Error('synthetic sign-out failure'); });
    const retrySession = vi.fn(async () => {});
    renderPanel({ retrySession, logout });

    await click('Sign out');

    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_OUT_FAILED);
    expect(buttons().signOut).toBeEnabled();

    await click('Retry');

    expect(screen.getByRole('alert')).toHaveTextContent(USUAL);
  });
});

describe('IDENTITY-009: Retry and Sign out in the app', () => {
  it('stays on the panel when Retry fails again, then opens the dashboard when it succeeds', async () => {
    const accept = api.exchange;
    await signInWithFailingExchange(500);
    await settle();
    // The sign-in form and the provider each try once.
    const failed = callsTo('/exchange').length;

    await click('Retry');
    await waitFor(() => expect(callsTo('/exchange')).toHaveLength(failed + 1));
    await findPanel();
    expect(dashboard()).not.toBeInTheDocument();

    api.exchange = accept;
    await click('Retry');

    await profileText('uid-one: null');
    expect(callsTo('/exchange')).toHaveLength(failed + 2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lastLocation()).toBe('/dashboard');
    expect(seen.dashboardMounts).toBe(1);
  });

  it('keeps the user signed in and explains when Sign out fails', async () => {
    await signInWithFailingExchange(500);
    api.logout = async () => { throw new TypeError('synthetic network failure'); };

    await click('Sign out');

    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_OUT_FAILED);
    expect(firebase.signOut).not.toHaveBeenCalled();
    expect(firebase.auth.currentUser.uid).toBe('uid-one');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  it('returns to the sign-in form when Sign out succeeds', async () => {
    await signInWithFailingExchange(500);

    await click('Sign out');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(callsTo('/logout')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('IDENTITY-009: where the panel is shown', () => {
  it('keeps a sign-in whose exchange fails on the sign-in route', async () => {
    await signInWithFailingExchange(500);
    await settle();

    expect(lastLocation()).toBe('/auth/login');
    expect(seen.locations).not.toContain('/dashboard');
    expect(seen.dashboardMounts).toBe(0);
  });

  // The sign-in form navigates once its own exchange succeeds, so the panel
  // is shown by the dashboard guard instead.
  it('shows the panel, not the dashboard, when the first profile read fails', async () => {
    api.profile = async () => reply(500);
    renderApp('/auth/login');
    await submitLogin();
    await findPanel();
    await settle();

    expect(callsTo('/users/uid-one')).toHaveLength(1);
    expect(lastLocation()).toBe('/dashboard');
    expect(seen.dashboardMounts).toBe(0);
  });

  it('shows the panel on a dashboard visit whose session fails', async () => {
    firebase.auth.currentUser = firebase.nextUser;
    api.exchange = async () => reply(503, { message: 'synthetic outage' });
    renderApp('/dashboard');

    await findPanel();

    expect(lastLocation()).toBe('/dashboard');
    expect(seen.dashboardMounts).toBe(0);
  });

  it('treats a 2xx exchange answer that is not JSON as a failure', async () => {
    api.exchange = async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('synthetic HTML page'); },
    });
    renderApp('/auth/login');
    await submitLogin();

    await findPanel();
    await settle();

    expect(callsTo('/users/uid-one')).toEqual([]);
    expect(seen.dashboardMounts).toBe(0);
    expect(lastLocation()).toBe('/auth/login');
  });

  it('treats a 2xx exchange answer of JSON null as a failure', async () => {
    api.exchange = async () => ({ ok: true, status: 200, json: async () => null });
    renderApp('/auth/login');
    await submitLogin();

    await findPanel();
    expect(callsTo('/users/uid-one')).toEqual([]);
  });

  it('shows the panel after a 409 when the Firebase sign-out fails', async () => {
    api.exchange = async () => reply(409, { message: 'Synthetic conflict message' });
    firebase.signOut = vi.fn(async () => { throw new Error('synthetic Firebase sign-out failure'); });
    renderApp('/auth/login');
    await submitLogin();

    await findPanel();
    await settle();

    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser.uid).toBe('uid-one');
    expect(callsTo('/logout')).toHaveLength(1);
    expect(seen.dashboardMounts).toBe(0);
    expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it('keeps the dashboard open when a later profile refresh fails', async () => {
    renderApp('/auth/login');
    await submitLogin();
    await profileText('uid-one: null');
    const reads = callsTo('/users/uid-one').length;

    api.profile = async () => reply(500);
    // Another auth event for the same user, such as a token refresh.
    await act(async () => setCurrentUser(firebase.auth.currentUser));
    await waitFor(() => expect(callsTo('/users/uid-one').length).toBeGreaterThan(reads));
    await settle();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dashboard()).getByTestId('profile')).toHaveTextContent('uid-one: null');
    expect(seen.dashboardMounts).toBe(1);
  });

  it('keeps the dashboard open when a refresh from the page fails', async () => {
    renderApp('/auth/login');
    await submitLogin();
    await profileText('uid-one: null');

    api.profile = async () => reply(500);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await screen.findByText('Refresh failed');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await profileText('uid-one: null');
  });
});
