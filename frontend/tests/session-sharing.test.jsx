// IDENTITY-014: one sign-in makes one exchange. Concurrent callers for the same
// user share an exchange, concurrent 401s renew once, and a late answer for a
// user who is no longer current does not leave the session marked as valid.
// Uses the real utils/auth and provider; Firebase and the API are fakes, and
// all data is synthetic.
import { act, fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => (await import('./support/fakeFirebase.js')).appModule());
vi.mock('firebase/auth', async () => {
  const sdk = (await import('./support/fakeFirebase.js')).sdkModule();
  // A spy, so a test can make the Google pop-up fail.
  return { ...sdk, signInWithPopup: vi.fn(sdk.signInWithPopup) };
});

import { signInWithPopup } from 'firebase/auth';

import {
  SESSION_REQUEST_TIMEOUT_MS,
  authFetch,
  clearAppJwt,
  exchangeFirebaseTokenForJwt,
  getAuthToken,
} from '../src/utils/auth';
import {
  api,
  callsTo,
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

const SYNTHETIC = '/api/synthetic-resource';

beforeEach(() => {
  setUpSignInTest();
  // An extra protected endpoint for the 401 tests.
  const harness = globalThis.fetch.getMockImplementation();
  api.resource = async () => reply(200, { ok: true });
  globalThis.fetch.mockImplementation((url, init = {}) => (url === SYNTHETIC ? api.resource(init) : harness(url, init)));
});

afterEach(tearDownSignInTest);

const exchangesFor = (uid) => seen.exchanges.filter((request) => request.uid === uid);
const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

describe('IDENTITY-014: one exchange per sign-in', () => {
  it('makes exactly one exchange for a sign-in from the email form', async () => {
    renderApp('/auth/login');
    await submitLogin();
    await profileText('uid-one: null');
    await settle();

    expect(callsTo('/exchange')).toHaveLength(1);
    expect(callsTo('/users/uid-one')).toHaveLength(1);
    expect(seen.locations.at(-1)).toBe('/dashboard');
    expect(seen.dashboardMounts).toBe(1);
  });

  it('makes exactly one exchange for a Google sign-in', async () => {
    renderApp('/auth/login');
    const google = await screen.findByRole('button', { name: 'Continue with Google' });
    await act(async () => { fireEvent.click(google); });
    await profileText('uid-one: null');
    await settle();

    expect(callsTo('/exchange')).toHaveLength(1);
    expect(seen.dashboardMounts).toBe(1);
  });

  it('makes exactly one exchange for a Google sign-up, carrying the typed name', async () => {
    renderApp('/auth/signup');
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: '  Synthetic Name  ' } });
    fireEvent.click(screen.getByLabelText(/i agree to the/i)); // Required for Google too (IDENTITY-021).
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' })); });
    await profileText('uid-one: Synthetic Name');
    await settle();

    expect(callsTo('/exchange')).toHaveLength(1);
    expect(seen.exchanges[0].fullName).toBe('Synthetic Name');
    expect(seen.locations.at(-1)).toBe('/dashboard');
    expect(seen.dashboardMounts).toBe(1);
  });

  it('does not keep a typed name for a later sign-in after a failed Google sign-up', async () => {
    renderApp('/auth/signup');
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Synthetic Name' } });
    fireEvent.click(screen.getByLabelText(/i agree to the/i)); // Required for Google too (IDENTITY-021).
    vi.mocked(signInWithPopup).mockRejectedValueOnce(new Error('synthetic pop-up closed'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' })); });
    expect(await screen.findByText('Google sign-in failed')).toBeInTheDocument();
    expect(callsTo('/exchange')).toHaveLength(0);

    // A later sign-in that does not come from the sign-up form.
    await act(async () => { setCurrentUser(firebase.nextUser); });
    await profileText('uid-one: null');
    await settle();

    expect(callsTo('/exchange')).toHaveLength(1);
    expect(seen.exchanges[0].fullName).toBeNull();
  });

  it('shows "Signing you in..." on the sign-in route until the session is ready', async () => {
    const held = deferred();
    api.exchange = () => held.promise;
    renderApp('/auth/login');
    await submitLogin();
    await flush();

    expect(screen.getByText('Signing you in...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument();
    expect(seen.locations).not.toContain('/dashboard');

    await act(async () => held.resolve(reply(200)));
    await settle();

    expect(screen.queryByText('Signing you in...')).not.toBeInTheDocument();
    expect(seen.locations.at(-1)).toBe('/dashboard');
    expect(callsTo('/exchange')).toHaveLength(1);
  });

  it('keeps "Signing you in..." while the first profile read is pending', async () => {
    const held = deferred();
    api.profile = () => held.promise;
    renderApp('/auth/login');
    await submitLogin();
    await flush();

    expect(screen.getByText('Signing you in...')).toBeInTheDocument();

    await act(async () => held.resolve(reply(200, { firebase_uid: 'uid-one', full_name: null })));
    await profileText('uid-one: null');
    expect(seen.dashboardMounts).toBe(1);
  });
});

// The sign-in form leaves the exchange to the provider, so its timeout
// (IDENTITY-011) also ends "Signing you in...".
describe('IDENTITY-014: a stalled exchange after sign-in', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
  afterEach(() => { vi.useRealTimers(); });

  const advance = (ms) => act(() => vi.advanceTimersByTimeAsync(ms));

  it('replaces "Signing you in..." with the panel and Retry on the sign-in route', async () => {
    api.exchange = () => new Promise(() => {});
    renderApp('/auth/login');
    await advance(0);
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'jane@example.test' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'synthetic-password-1' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^sign in$/i })); });
    await advance(0);
    expect(screen.getByText('Signing you in...')).toBeInTheDocument();

    await advance(SESSION_REQUEST_TIMEOUT_MS);

    expect(screen.queryByText('Signing you in...')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load your account/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(callsTo('/exchange')).toHaveLength(1);
    expect(seen.locations.at(-1)).toBe('/auth/login');
  });
});

describe('IDENTITY-014: shared exchanges', () => {
  beforeEach(() => {
    firebase.auth.currentUser = createUser('uid-one');
  });

  it('lets three concurrent callers share one exchange', async () => {
    const held = deferred();
    api.exchange = () => held.promise;

    const results = Promise.all([exchangeFirebaseTokenForJwt(), getAuthToken(), exchangeFirebaseTokenForJwt()]);
    await flush();
    expect(callsTo('/exchange')).toHaveLength(1);

    held.resolve(reply(200));
    await expect(results).resolves.toEqual(['cookie_session', 'cookie_session', 'cookie_session']);

    // The session is now known, so a later caller does not exchange.
    await getAuthToken();
    expect(callsTo('/exchange')).toHaveLength(1);
  });

  it('shares one exchange between three concurrent requests before the first session', async () => {
    const held = deferred();
    api.exchange = () => held.promise;

    const responses = Promise.all([authFetch(SYNTHETIC), authFetch(SYNTHETIC), authFetch(SYNTHETIC)]);
    await flush();
    expect(callsTo('/exchange')).toHaveLength(1);
    expect(callsTo(SYNTHETIC)).toEqual([]);

    held.resolve(reply(200));
    expect((await responses).map(({ status }) => status)).toEqual([200, 200, 200]);
    expect(callsTo('/exchange')).toHaveLength(1);
  });

  it('rejects every sharer when the shared exchange fails, and the next call tries again', async () => {
    const held = deferred();
    api.exchange = () => held.promise;

    const first = exchangeFirebaseTokenForJwt().catch((error) => error);
    const second = exchangeFirebaseTokenForJwt().catch((error) => error);
    await flush();
    held.resolve(reply(500, { message: 'synthetic failure' }));

    expect((await first).status).toBe(500);
    expect((await second).status).toBe(500);
    expect(callsTo('/exchange')).toHaveLength(1);

    api.exchange = async () => reply(200);
    await expect(exchangeFirebaseTokenForJwt()).resolves.toBe('cookie_session');
    expect(callsTo('/exchange')).toHaveLength(2);
  });

  it('does not share an exchange that carries another name', async () => {
    const held = deferred();
    api.exchange = () => held.promise;

    const plain = exchangeFirebaseTokenForJwt();
    const named = exchangeFirebaseTokenForJwt('Synthetic Name');
    await flush();

    expect(seen.exchanges.map(({ fullName }) => fullName)).toEqual([null, 'Synthetic Name']);
    held.resolve(reply(200));
    await Promise.all([plain, named]);
  });

  it('starts a new exchange after clearAppJwt instead of reusing the one in progress', async () => {
    const held = deferred();
    api.exchange = () => held.promise;
    const before = exchangeFirebaseTokenForJwt();
    await flush();

    clearAppJwt();
    api.exchange = async () => reply(200);
    await expect(exchangeFirebaseTokenForJwt()).resolves.toBe('cookie_session');
    expect(callsTo('/exchange')).toHaveLength(2);

    // The older exchange answers last: its cookie replaced the newer one, so
    // the next request must exchange again.
    held.resolve(reply(200));
    await before;
    await getAuthToken();
    expect(callsTo('/exchange')).toHaveLength(3);
  });
});

describe('IDENTITY-014: renewal after 401', () => {
  beforeEach(async () => {
    firebase.auth.currentUser = createUser('uid-one');
    await getAuthToken();
    expect(callsTo('/exchange')).toHaveLength(1);
  });

  // Each request first gets the next held answer, then 200 once resent.
  function holdFirstAnswers(count) {
    const held = Array.from({ length: count }, deferred);
    let calls = 0;
    api.resource = () => {
      calls += 1;
      return calls <= count ? held[calls - 1].promise : Promise.resolve(reply(200, { ok: true }));
    };
    return held;
  }

  it('renews once for two concurrent 401s', async () => {
    const [a, b] = holdFirstAnswers(2);
    const responses = Promise.all([authFetch(SYNTHETIC), authFetch(SYNTHETIC)]);
    await flush();
    expect(callsTo(SYNTHETIC)).toHaveLength(2);

    a.resolve(reply(401));
    b.resolve(reply(401));

    expect((await responses).map(({ status }) => status)).toEqual([200, 200]);
    expect(callsTo('/exchange')).toHaveLength(2);
    expect(callsTo(SYNTHETIC)).toHaveLength(4);
  });

  it('only resends a request that got its 401 after another request renewed', async () => {
    const [a, b] = holdFirstAnswers(2);
    const first = authFetch(SYNTHETIC);
    const second = authFetch(SYNTHETIC);
    await flush();

    a.resolve(reply(401));
    expect((await first).status).toBe(200);
    expect(callsTo('/exchange')).toHaveLength(2);

    // Sent with the old cookie, so the renewal above already covers it.
    b.resolve(reply(401));
    expect((await second).status).toBe(200);
    expect(callsTo('/exchange')).toHaveLength(2);
    expect(callsTo(SYNTHETIC)).toHaveLength(4);
  });

  it('still renews for a 401 to a request sent with the latest cookie', async () => {
    api.resource = vi.fn()
      .mockResolvedValueOnce(reply(401))
      .mockResolvedValueOnce(reply(200))
      .mockResolvedValueOnce(reply(401))
      .mockResolvedValue(reply(200));

    expect((await authFetch(SYNTHETIC)).status).toBe(200);
    expect(callsTo('/exchange')).toHaveLength(2);
    expect((await authFetch(SYNTHETIC)).status).toBe(200);
    expect(callsTo('/exchange')).toHaveLength(3);
  });
});

describe('IDENTITY-014: a late answer for another user', () => {
  it('clears the session flag when the old user\'s exchange answers after the new user\'s', async () => {
    const heldA = deferred();
    api.exchange = async ({ uid }) => (uid === 'uid-a' ? heldA.promise : reply(200));
    firebase.auth.currentUser = createUser('uid-a');
    const exchangeA = exchangeFirebaseTokenForJwt();
    await flush();

    firebase.auth.currentUser = createUser('uid-b');
    await getAuthToken();
    expect(exchangesFor('uid-b')).toHaveLength(1);
    // B's session is known, so B does not exchange again yet.
    await getAuthToken();
    expect(exchangesFor('uid-b')).toHaveLength(1);

    // A's cookie arrives last and replaces B's.
    heldA.resolve(reply(200));
    await expect(exchangeA).resolves.toBe('cookie_session');

    await getAuthToken();
    expect(exchangesFor('uid-b')).toHaveLength(2);
    expect(exchangesFor('uid-a')).toHaveLength(1);
  });
});
