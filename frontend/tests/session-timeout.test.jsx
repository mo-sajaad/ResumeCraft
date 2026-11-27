// IDENTITY-011: a stalled exchange or profile read ends after
// SESSION_REQUEST_TIMEOUT_MS, so the app leaves the loading screen and shows the
// could-not-load-your-account panel with Retry. Fake timers; Firebase and the
// API are fakes, and all data is synthetic.
import { act, fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => (await import('./support/fakeFirebase.js')).appModule());
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

import { REQUEST_TIMEOUT, SESSION_REQUEST_TIMEOUT_MS, withTimeout } from '../src/utils/auth';
import { api, callsTo, renderApp, reply, seen, setUpSignInTest, tearDownSignInTest } from './support/authHarness.jsx';
import { firebase } from './support/fakeFirebase.js';

const PANEL = /could not load your account/i;
const USUAL = 'This is usually temporary. Check your connection, then try again.';

const never = () => new Promise(() => {});

beforeEach(() => {
  setUpSignInTest();
  // Only timers: promises, microtasks and React's scheduler stay real.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  tearDownSignInTest();
});

// Runs timers and the promise chains they start, inside act.
const advance = (ms) => act(() => vi.advanceTimersByTimeAsync(ms));

// A returning user opens the dashboard.
async function visitDashboard() {
  firebase.auth.currentUser = firebase.nextUser;
  renderApp('/dashboard');
  await advance(0);
}

const loader = () => screen.queryByText('Checking your session...');
const panel = () => screen.queryByRole('alert');

function expectPanelWithRetry() {
  expect(loader()).not.toBeInTheDocument();
  expect(panel()).toHaveTextContent(PANEL);
  expect(panel()).toHaveTextContent(USUAL);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  expect(seen.dashboardMounts).toBe(0);
}

describe('IDENTITY-011: withTimeout', () => {
  it('rejects with REQUEST_TIMEOUT and aborts the signal when the work does not settle', async () => {
    let signal;
    const result = withTimeout((s) => { signal = s; return never(); });
    const outcome = result.catch((error) => error);

    await vi.advanceTimersByTimeAsync(SESSION_REQUEST_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(REQUEST_TIMEOUT);
    expect(signal.aborted).toBe(true);
  });

  it('returns the result and clears its timer when the work finishes in time', async () => {
    let signal;
    await expect(withTimeout(async (s) => { signal = s; return 'synthetic result'; })).resolves.toBe('synthetic result');

    expect(vi.getTimerCount()).toBe(0);
    expect(signal.aborted).toBe(false);
  });

  it('passes on the error of work that fails in time', async () => {
    const failure = new Error('synthetic failure');
    await expect(withTimeout(async () => { throw failure; })).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('IDENTITY-011: a stalled server ends the loading screen', () => {
  it('shows the panel with Retry when the exchange never answers', async () => {
    api.exchange = never;
    await visitDashboard();

    await advance(SESSION_REQUEST_TIMEOUT_MS - 1);
    expect(loader()).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();

    await advance(1);
    expectPanelWithRetry();
    // The stalled request was aborted, and no profile read was attempted.
    const [[, init]] = callsTo('/exchange');
    expect(init.signal.aborted).toBe(true);
    expect(callsTo('/users/uid-one')).toEqual([]);
  });

  it('shows the panel with Retry when the profile read never answers', async () => {
    api.profile = never;
    await visitDashboard();
    expect(callsTo('/exchange')).toHaveLength(1);
    expect(callsTo('/users/uid-one')).toHaveLength(1);

    await advance(SESSION_REQUEST_TIMEOUT_MS - 1);
    expect(loader()).toBeInTheDocument();

    await advance(1);
    expectPanelWithRetry();
    const [[, init]] = callsTo('/users/uid-one');
    expect(init.signal.aborted).toBe(true);
  });

  it.each([
    ['exchange', () => { api.exchange = async () => ({ ok: true, status: 200, json: never }); }],
    ['profile', () => { api.profile = async () => ({ ok: true, status: 200, json: never }); }],
  ])('shows the panel when the %s body never finishes', async (_label, stall) => {
    stall();
    await visitDashboard();

    await advance(SESSION_REQUEST_TIMEOUT_MS - 1);
    expect(loader()).toBeInTheDocument();

    await advance(1);
    expectPanelWithRetry();
  });

  it('opens the dashboard on Retry once the server answers again', async () => {
    const answer = api.profile;
    api.profile = never;
    await visitDashboard();
    await advance(SESSION_REQUEST_TIMEOUT_MS);
    expectPanelWithRetry();

    api.profile = answer;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    await advance(0);

    expect(panel()).not.toBeInTheDocument();
    expect(screen.getByTestId('profile')).toHaveTextContent('uid-one');
    expect(seen.dashboardMounts).toBe(1);
  });

  it('ends a healthy load without waiting for the timeout', async () => {
    api.profile = async (uid) => reply(200, { firebase_uid: uid, full_name: null });
    await visitDashboard();

    expect(screen.getByTestId('profile')).toHaveTextContent('uid-one');
    expect(vi.getTimerCount()).toBe(0);
  });
});
