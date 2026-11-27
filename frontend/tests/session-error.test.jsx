// IDENTITY-009: the could-not-load-your-account panel (SessionError) and when
// the guards show it. Firebase and the API are fakes; all data is synthetic.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => (await import('./support/fakeFirebase.js')).appModule());
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

import { AuthContext } from '../src/context/AuthContext.jsx';
import SessionError from '../src/routes/SessionError.jsx';
import { describeRefusal } from '../src/utils/auth';
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
import { createUser, firebase, setCurrentUser } from './support/fakeFirebase.js';

const PANEL = /could not load your account/i;
const SIGN_OUT_FAILED = 'You could not be signed out. Check your connection and try again.';
const USUAL = 'This is usually temporary. Check your connection, then try again.';
const SERVER_NOT_CONFIRMED = 'You are signed out on this device, but the server could not confirm it.';

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

  it('keeps the user signed in and explains when the Firebase sign-out fails', async () => {
    await signInWithFailingExchange(500);
    firebase.signOut = vi.fn(async () => { throw new Error('synthetic Firebase sign-out failure'); });

    await click('Sign out');

    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_OUT_FAILED);
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser.uid).toBe('uid-one');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  // IDENTITY-012: a logout request that fails still signs out of Firebase.
  it('signs out of Firebase and says the server did not confirm it when the logout request fails', async () => {
    await signInWithFailingExchange(500);
    api.logout = async () => { throw new TypeError('synthetic network failure'); };

    await click('Sign out');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(SERVER_NOT_CONFIRMED);
    expect(screen.queryByText(PANEL)).not.toBeInTheDocument();
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

  // The sign-in form no longer navigates by itself (IDENTITY-014), so the
  // sign-in route's guard shows the panel.
  it('shows the panel, not the dashboard, when the first profile read fails', async () => {
    api.profile = async () => reply(500);
    renderApp('/auth/login');
    await submitLogin();
    await findPanel();
    await settle();

    expect(callsTo('/users/uid-one')).toHaveLength(1);
    expect(lastLocation()).toBe('/auth/login');
    expect(seen.locations).not.toContain('/dashboard');
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

// ---------------------------------------------------------------------------
// IDENTITY-009 follow-up: the panel shows the server's message for a 4xx
// refusal, and offers Retry only when retrying can help (408, 429, or no
// usable message). 5xx bodies are never shown.

const REVOKED = 'Synthetic: your sign-in was revoked. Sign in again.';

const panelButtons = () => ({
  retry: screen.queryByRole('button', { name: /retry|please wait/i }),
  signOut: screen.queryByRole('button', { name: 'Sign out' }),
});

// The panel says `text`, and has Retry only if `retry`; Sign out is always there.
async function expectPanel(text, { retry }) {
  const panel = await findPanel();
  await waitFor(() => expect(panel).toHaveTextContent(text));
  const { retry: retryButton, signOut } = panelButtons();
  if (retry) expect(retryButton).toBeEnabled();
  else expect(retryButton).not.toBeInTheDocument();
  expect(signOut).toBeEnabled();
  expect(dashboard()).not.toBeInTheDocument();
  return panel;
}

async function signInWithExchange(handler) {
  api.exchange = handler;
  renderApp('/auth/login');
  await submitLogin();
  await settle();
}

describe('IDENTITY-009 follow-up: server message: describeRefusal', () => {
  it.each([[200], [201], [204], [301], [304], [399], [500], [502], [503]])(
    'returns null for status %i, even with a message',
    (status) => {
      expect(describeRefusal(status, { message: 'Synthetic message', error: 'Synthetic error' })).toBeNull();
    },
  );

  it.each([
    ['no body', undefined],
    ['a null body', null],
    ['an empty object', {}],
    ['an empty message', { message: '' }],
    ['a blank message', { message: '   \n\t' }],
    ['a numeric message', { message: 42 }],
    ['an object message', { message: { text: 'Synthetic' } }],
    ['a blank error', { error: '  ' }],
    ['a non-string error', { error: ['Synthetic'] }],
  ])('returns null for a 4xx with %s', (_label, data) => {
    expect(describeRefusal(400, data)).toBeNull();
  });

  it('uses `error` when `message` is missing', () => {
    expect(describeRefusal(403, { error: 'Synthetic forbidden' }))
      .toEqual({ message: 'Synthetic forbidden', retryable: false });
  });

  it('prefers `message` over `error`', () => {
    expect(describeRefusal(400, { message: 'Synthetic message', error: 'Synthetic error' }))
      .toEqual({ message: 'Synthetic message', retryable: false });
  });

  it.each([[408], [429]])('marks %i as retryable', (status) => {
    expect(describeRefusal(status, { message: 'Synthetic wait' }))
      .toEqual({ message: 'Synthetic wait', retryable: true });
  });

  it.each([[400], [401], [403], [404], [409], [422], [499]])('marks %i as not retryable', (status) => {
    expect(describeRefusal(status, { message: 'Synthetic refusal' }))
      .toEqual({ message: 'Synthetic refusal', retryable: false });
  });
});

describe('IDENTITY-009 follow-up: server message: exchange refusals', () => {
  it('shows a 409 message without Retry when Firebase sign-out fails, and Sign out still works', async () => {
    const conflict = 'Synthetic: this email belongs to another account.';
    firebase.signOut = vi.fn(async () => { throw new Error('synthetic Firebase sign-out failure'); });
    await signInWithExchange(async () => reply(409, { message: conflict }));

    await expectPanel(conflict, { retry: false });
    expect(firebase.auth.currentUser.uid).toBe('uid-one');

    firebase.signOut = vi.fn(async () => setCurrentUser(null));
    await click('Sign out');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it.each([
    [401, REVOKED],
    [400, 'Synthetic: the sign-in request was invalid.'],
  ])('shows the message of a %i without Retry', async (status, message) => {
    await signInWithExchange(async () => reply(status, { message }));

    const panel = await expectPanel(message, { retry: false });
    expect(panel).not.toHaveTextContent(USUAL);
  });

  it('shows the generic text with Retry for a 500, and none of its body', async () => {
    const detail = 'synthetic internal detail: relation "users" at db.internal:5432';
    await signInWithExchange(async () => reply(500, { message: 'Internal server error', error: detail }));

    await expectPanel(USUAL, { retry: true });
    expect(document.body).not.toHaveTextContent('Internal server error');
    expect(document.body).not.toHaveTextContent(detail);
  });

  it('shows the generic text with Retry when the exchange request fails', async () => {
    await signInWithExchange(async () => { throw new TypeError('synthetic network failure'); });

    await expectPanel(USUAL, { retry: true });
    expect(document.body).not.toHaveTextContent('synthetic network failure');
  });

  it('shows the generic text with Retry for a 4xx that is not JSON', async () => {
    await signInWithExchange(async () => ({
      ok: false,
      status: 403,
      json: async () => { throw new SyntaxError('synthetic HTML page'); },
    }));

    await expectPanel(USUAL, { retry: true });
  });

  it('shows a 429 message with Retry; a 500 on Retry brings back the generic text; success opens the dashboard', async () => {
    const slowDown = 'Synthetic: too many attempts, wait a minute.';
    const accept = api.exchange;
    await signInWithExchange(async () => reply(429, { message: slowDown }));

    await expectPanel(slowDown, { retry: true });

    api.exchange = async () => reply(500, { message: 'Internal server error' });
    await click('Retry');
    await settle();

    const panel = await expectPanel(USUAL, { retry: true });
    expect(panel).not.toHaveTextContent(slowDown);
    expect(document.body).not.toHaveTextContent('Internal server error');

    api.exchange = accept;
    await click('Retry');

    await profileText('uid-one: null');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lastLocation()).toBe('/dashboard');
    expect(seen.dashboardMounts).toBe(1);
  });
});

describe('IDENTITY-009 follow-up: server message: profile refusals', () => {
  it.each([
    [401, { message: REVOKED }, REVOKED],
    [403, { message: 'Synthetic: this account is disabled.' }, 'Synthetic: this account is disabled.'],
    [401, { error: 'Synthetic: session not accepted.' }, 'Synthetic: session not accepted.'],
    [403, { error: 'Synthetic: access denied.' }, 'Synthetic: access denied.'],
  ])('shows the text of a profile %i %j without Retry', async (status, body, text) => {
    api.profile = async () => reply(status, body);
    renderApp('/auth/login');
    await submitLogin();
    await settle();

    const panel = await expectPanel(text, { retry: false });
    expect(panel).not.toHaveTextContent(USUAL);
    expect(lastLocation()).toBe('/auth/login');
  });

  it('shows the generic text with Retry for a profile 500, and none of its body', async () => {
    api.profile = async () => reply(500, { message: 'Internal server error', error: 'synthetic stack detail' });
    renderApp('/auth/login');
    await submitLogin();
    await settle();

    await expectPanel(USUAL, { retry: true });
    expect(document.body).not.toHaveTextContent('Internal server error');
    expect(document.body).not.toHaveTextContent('synthetic stack detail');
  });

  // The profile error carries no status, so a 409 profile answer is not the
  // exchange's other-account refusal and does not sign out.
  it('does not sign out on a profile 409', async () => {
    api.profile = async () => reply(409, { message: 'Synthetic profile conflict' });
    renderApp('/auth/login');
    await submitLogin();
    await settle();

    await expectPanel('Synthetic profile conflict', { retry: false });
    expect(firebase.signOut).not.toHaveBeenCalled();
    expect(callsTo('/logout')).toEqual([]);
    expect(firebase.auth.currentUser.uid).toBe('uid-one');
  });
});

describe('IDENTITY-009 follow-up: server message: another user', () => {
  const A_TEXT = 'Synthetic: user A was refused.';
  const B_TEXT = 'Synthetic: user B was refused.';

  // User A has a 401 panel on the dashboard; then B signs in with `exchangeB`.
  async function refuseAThenSwitchToB(exchangeB) {
    const heldB = deferred();
    api.exchange = async ({ uid }) => (uid === 'uid-one' ? reply(401, { message: A_TEXT }) : heldB.promise);
    firebase.auth.currentUser = createUser('uid-one');
    renderApp('/dashboard');
    await expectPanel(A_TEXT, { retry: false });

    await act(async () => setCurrentUser(createUser('uid-two')));
    // While B loads, A's refusal is not shown.
    expect(document.body).not.toHaveTextContent(A_TEXT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => heldB.resolve(exchangeB()));
    await settle();
  }

  it('shows B the generic text, not A\'s message, when B\'s exchange fails with a 500', async () => {
    await refuseAThenSwitchToB(() => reply(500, { message: 'Internal server error' }));

    await expectPanel(USUAL, { retry: true });
    expect(document.body).not.toHaveTextContent(A_TEXT);
  });

  it('shows B its own message, not A\'s', async () => {
    await refuseAThenSwitchToB(() => reply(400, { message: B_TEXT }));

    const panel = await expectPanel(B_TEXT, { retry: false });
    expect(panel).not.toHaveTextContent(A_TEXT);
  });

  it('opens the dashboard for B with no panel when B\'s exchange succeeds', async () => {
    await refuseAThenSwitchToB(() => reply(200));

    // The held exchange skips the fake server's name store, so no name is known.
    await profileText('uid-two:');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(A_TEXT);
  });

  it('never shows A\'s refusal that arrives after B has signed in', async () => {
    const heldA = deferred();
    api.exchange = async ({ uid }) => (uid === 'uid-one' ? heldA.promise : reply(500));
    firebase.auth.currentUser = createUser('uid-one');
    renderApp('/dashboard');
    await waitFor(() => expect(seen.exchanges.map(({ uid }) => uid)).toContain('uid-one'));

    await act(async () => setCurrentUser(createUser('uid-two')));
    await expectPanel(USUAL, { retry: true });

    await act(async () => heldA.resolve(reply(401, { message: A_TEXT })));
    await settle();

    await expectPanel(USUAL, { retry: true });
    expect(document.body).not.toHaveTextContent(A_TEXT);
  });
});

describe('IDENTITY-009 follow-up: server message: failed Sign out', () => {
  it('replaces the server message with the failed-sign-out text, and Sign out still works', async () => {
    await signInWithExchange(async () => reply(401, { message: REVOKED }));
    await expectPanel(REVOKED, { retry: false });

    firebase.signOut = vi.fn(async () => { throw new Error('synthetic Firebase sign-out failure'); });
    await click('Sign out');

    const panel = screen.getByRole('alert');
    expect(panel).toHaveTextContent(SIGN_OUT_FAILED);
    expect(panel).not.toHaveTextContent(REVOKED);
    expect(panelButtons().retry).not.toBeInTheDocument();
    expect(panelButtons().signOut).toBeEnabled();
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser.uid).toBe('uid-one');

    firebase.signOut = vi.fn(async () => setCurrentUser(null));
    await click('Sign out');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves the panel for the sign-in page when only the server logout fails', async () => {
    await signInWithExchange(async () => reply(401, { message: REVOKED }));
    await expectPanel(REVOKED, { retry: false });

    api.logout = async () => { throw new TypeError('synthetic network failure'); };
    await click('Sign out');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser).toBeNull();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(SERVER_NOT_CONFIRMED);
    expect(alert).not.toHaveTextContent(REVOKED);
  });
});
