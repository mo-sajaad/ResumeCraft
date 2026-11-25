// IDENTITY-002 and 003 in the browser: profile after sign-up, refused exchanges.
// Firebase and the API are fakes; all data is synthetic.
import process from 'node:process';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => (await import('./support/fakeFirebase.js')).appModule());
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

import { exchangeFirebaseTokenForJwt } from '../src/utils/auth';
import {
  CONFIRM,
  NAME,
  api,
  callsTo,
  click,
  deferred,
  findVerifyPage,
  profileText,
  renderApp,
  reply,
  seen,
  settle,
  setUpSignInTest,
  submitLogin,
  submitSignup,
  tearDownSignInTest,
} from './support/authHarness.jsx';
import { createUser, firebase, setCurrentUser } from './support/fakeFirebase.js';

const CONFLICT = 'Synthetic conflict message';

beforeEach(setUpSignInTest);
afterEach(tearDownSignInTest);

// A realistic sign-up: the new user is not verified until they open the link.
async function signUpAndVerify() {
  firebase.nextUser = createUser('uid-new', { verified: false });
  renderApp('/auth/signup');
  await submitSignup();
  await findVerifyPage();
  firebase.accounts['uid-new'].verified = true;
}

describe('IDENTITY-002: email sign-up ends with a named profile', () => {
  it('and never creates a nameless session before the email is verified', async () => {
    await signUpAndVerify();
    await settle();
    expect(seen.exchanges).toEqual([]);

    await click(CONFIRM);

    await profileText(`uid-new: ${NAME}`);
    // The first profile on screen is already the named one.
    expect(seen.exchanges).toEqual([{ uid: 'uid-new', verified: true, fullName: NAME }]);
    expect(callsTo('/users/uid-new')).toHaveLength(1);
  });

  it('when the first exchange fails and is tried again', async () => {
    const accept = api.exchange;
    api.exchange = async () => reply(400, { message: 'synthetic failure' });
    await signUpAndVerify();
    await click(CONFIRM);
    await screen.findByRole('alert');
    expect(seen.dashboardMounts).toBe(0);

    api.exchange = accept;
    await click(CONFIRM);

    await profileText(`uid-new: ${NAME}`);
    expect(seen.exchanges.map(({ fullName }) => fullName)).toEqual([NAME, NAME]);
  });

  it('when an older, nameless profile response arrives after a newer one', async () => {
    const slow = deferred();
    const slowRead = vi.fn(async () => ({ firebase_uid: 'uid-new', full_name: null }));
    const load = api.profile;
    // The first request is the one made while confirming.
    api.profile = vi.fn(load).mockImplementationOnce(() => slow.promise);
    await signUpAndVerify();
    await click(CONFIRM);
    await waitFor(() => expect(api.profile).toHaveBeenCalledTimes(1));
    // An auth event for the same, now verified, user loads the profile again.
    await act(async () => setCurrentUser(firebase.auth.currentUser));
    await profileText(`uid-new: ${NAME}`);

    await act(async () => slow.resolve({ ok: true, status: 200, json: slowRead }));
    await settle();

    expect(slowRead).toHaveBeenCalled();
    await profileText(`uid-new: ${NAME}`);
  });

  it('when updateProfile rejects', async () => {
    firebase.updateProfile = vi.fn(async () => { throw new Error('synthetic updateProfile failure'); });
    await signUpAndVerify();
    expect(firebase.updateProfile).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser.displayName).toBeNull();

    await click(CONFIRM);

    await profileText(`uid-new: ${NAME}`);
  });

  it('still applies an older response when the newer refresh fails', async () => {
    const slow = deferred();
    api.profile = vi.fn()
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(async () => reply(500));
    renderApp('/auth/login');
    await submitLogin();
    await waitFor(() => expect(api.profile).toHaveBeenCalledTimes(1));
    await profileText('no profile');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('Refresh failed');
    await act(async () => slow.resolve(reply(200, { firebase_uid: 'uid-one', full_name: 'Older Name' })));

    await profileText('uid-one: Older Name');
  });
});

describe('IDENTITY-003: a 409 exchange', () => {
  // Answers only once the dashboard has opened, as a real round trip would:
  // an instant answer could be batched into one render with the sign-in.
  async function refuseExchangeDuring(submit) {
    const gate = deferred();
    api.exchange = async () => {
      await gate.promise;
      return reply(409, { message: CONFLICT });
    };
    await submit();
    await screen.findByRole('main', { name: 'Dashboard' });
    await act(async () => gate.resolve());
  }

  async function expectRefused(form = /^sign in$/i) {
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(CONFLICT);
    expect(await screen.findByRole('button', { name: form })).toBeInTheDocument();
    await settle();
    expect(firebase.auth.currentUser).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(CONFLICT);
    expect(screen.queryByRole('main', { name: 'Dashboard' })).not.toBeInTheDocument();
  }

  it.each([
    ['logout succeeds', async () => reply(204)],
    ['logout answers 401', async () => reply(401)],
    ['logout answers 500', async () => reply(500)],
    ['logout cannot be reached', async () => { throw new TypeError('synthetic network failure'); }],
  ])('signs out of Firebase and explains why on the sign-in page when %s', async (_label, logout) => {
    api.logout = logout;
    renderApp('/auth/login');
    await refuseExchangeDuring(submitLogin);

    await expectRefused();
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
  });

  it('is also explained after sign-up, when the email is confirmed', async () => {
    api.exchange = async () => reply(409, { message: CONFLICT });
    await signUpAndVerify();
    expect(seen.exchanges).toEqual([]);

    await click(CONFIRM);

    // The user is still on the sign-up route.
    await expectRefused(/create account/i);
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(callsTo('/logout')).toHaveLength(1);
    expect(seen.dashboardMounts).toBe(0);
  });

  it('clears the message on the next sign-in', async () => {
    const accept = api.exchange;
    renderApp('/auth/login');
    await refuseExchangeDuring(submitLogin);
    await expectRefused();

    api.exchange = accept;
    firebase.nextUser = createUser('uid-two');
    await submitLogin();
    await profileText('uid-two: null');
    fireEvent.click(within(screen.getByRole('main', { name: 'Dashboard' })).getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([[400], [500]])('is the only refusal that signs out: %i does not', async (status) => {
    api.exchange = async () => reply(status, { message: 'synthetic failure' });
    renderApp('/auth/login');
    await submitLogin();
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    await settle();

    expect(firebase.signOut).not.toHaveBeenCalled();
    expect(callsTo('/logout')).toEqual([]);
    expect(firebase.auth.currentUser.uid).toBe('uid-one');
    expect(screen.getByRole('main', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not sign out the user who has signed in meanwhile', async () => {
    const slow = deferred();
    const accept = api.exchange;
    api.exchange = (request) => (request.uid === 'uid-one' ? slow.promise : accept(request));
    renderApp('/auth/login');
    await screen.findByRole('button', { name: /^sign in$/i });
    await act(async () => setCurrentUser(createUser('uid-one')));
    await waitFor(() => expect(callsTo('/exchange')).toHaveLength(1));
    await act(async () => setCurrentUser(createUser('uid-two')));
    await profileText('uid-two: null');

    await act(async () => slow.resolve(reply(409, { message: CONFLICT })));
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    await settle();

    expect(firebase.signOut).not.toHaveBeenCalled();
    expect(callsTo('/logout')).toEqual([]);
    expect(firebase.auth.currentUser.uid).toBe('uid-two');
    await profileText('uid-two: null');
  });

  it('does not sign out a user who signs in while the logout request is pending', async () => {
    const accept = api.exchange;
    const pendingLogout = deferred();
    api.exchange = async (request) => (
      request.uid === 'uid-one' ? reply(409, { message: CONFLICT }) : accept(request)
    );
    api.logout = () => pendingLogout.promise;
    renderApp('/auth/login');
    await screen.findByRole('button', { name: /^sign in$/i });
    await act(async () => setCurrentUser(createUser('uid-one')));
    await waitFor(() => expect(callsTo('/logout')).toHaveLength(1));
    await act(async () => setCurrentUser(createUser('uid-two')));
    await profileText('uid-two: null');

    await act(async () => pendingLogout.resolve(reply(204)));
    await settle();

    expect(firebase.signOut).not.toHaveBeenCalled();
    expect(firebase.auth.currentUser.uid).toBe('uid-two');
    await profileText('uid-two: null');
  });

  it('stops loading when Firebase sign-out fails', async () => {
    firebase.auth.currentUser = createUser('uid-one');
    firebase.signOut = vi.fn(async () => { throw new Error('synthetic sign-out failure'); });
    api.exchange = async () => reply(409, { message: CONFLICT });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      renderApp('/dashboard');
      await waitFor(() => expect(firebase.signOut).toHaveBeenCalled());
      await settle();
    } finally {
      process.off('unhandledRejection', unhandled);
    }

    expect(unhandled).not.toHaveBeenCalled();
    expect(screen.queryByText(/loading authentication/i)).not.toBeInTheDocument();
  });
});

describe('IDENTITY-003: exchangeFirebaseTokenForJwt errors', () => {
  it.each([[400], [401], [409], [500]])('carry status %i and the server message', async (status) => {
    firebase.auth.currentUser = createUser('uid-one');
    api.exchange = async () => reply(status, { message: 'synthetic failure' });

    await expect(exchangeFirebaseTokenForJwt()).rejects.toMatchObject({ status, message: 'synthetic failure' });
  });

  it('carry the status when the body is not JSON', async () => {
    firebase.auth.currentUser = createUser('uid-one');
    api.exchange = async () => ({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('synthetic non-JSON body'); },
    });

    await expect(exchangeFirebaseTokenForJwt()).rejects.toMatchObject({
      status: 502,
      message: 'Failed to exchange Firebase token',
    });
  });
});
