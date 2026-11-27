// IDENTITY-006 in the browser: nothing until the email is verified. Uses the
// real provider, guards and pages; Firebase and the API are fakes. Real Firebase
// emails, event order and token claims are not covered. All data is synthetic.
import process from 'node:process';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => (await import('./support/fakeFirebase.js')).appModule());
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

import { clearAppJwt, exchangeFirebaseTokenForJwt } from '../src/utils/auth';
import {
  CONFIRM,
  NAME,
  api,
  callsTo,
  click,
  deferred,
  findVerifyPage,
  notVerified,
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

const ALREADY_USED = 'Synthetic conflict message';
const RESEND = /resend email|sending\.\.\./i;
const NOT_VERIFIED_YET = /not verified yet/i;

const unhandled = vi.fn();

beforeEach(() => {
  setUpSignInTest();
  firebase.nextUser = createUser('uid-new', { verified: false });
  unhandled.mockReset();
  process.on('unhandledRejection', unhandled);
});

afterEach(async () => {
  await settle();
  process.off('unhandledRejection', unhandled);
  tearDownSignInTest();
  expect(unhandled).not.toHaveBeenCalled();
});

const verifyOnServer = (uid = 'uid-new') => { firebase.accounts[uid].verified = true; };
const statusText = () => screen.getByRole('status').textContent;
const button = (name) => screen.getByRole('button', { name });

async function signUp() {
  renderApp('/auth/signup');
  await submitSignup();
  await findVerifyPage();
}

async function logIn() {
  renderApp('/auth/login');
  await submitLogin();
  await findVerifyPage();
}

function expectNoApiUse() {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(seen.dashboardMounts).toBe(0);
}

function expectButtons(enabled) {
  for (const name of [CONFIRM, RESEND, 'Sign out']) {
    if (enabled) expect(button(name)).toBeEnabled();
    else expect(button(name)).toBeDisabled();
  }
}

async function switchTo(uid, options) {
  const user = createUser(uid, options);
  await act(async () => setCurrentUser(user));
  return user;
}

// The other user's page, with nothing carried over from the first user.
async function expectUntouchedPage(email) {
  await settle();
  expect(await findVerifyPage()).toBeInTheDocument();
  expect(screen.getByText(email)).toBeInTheDocument();
  expect(statusText()).toBe('');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expectButtons(true);
}

describe('sign-up with email and password', () => {
  it('shows the check-your-email page and sends one email, without using the API', async () => {
    await signUp();
    await settle();

    const heading = screen.getByRole('heading', { name: 'Check your email' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText('uid-new@example.test')).toBeInTheDocument();
    expect(statusText()).toBe('Verification email sent.');
    // Exactly the user: actionCodeSettings would need an allowed domain.
    expect(firebase.sendEmailVerification.mock.calls).toEqual([[firebase.nextUser]]);
    expectNoApiUse();
    expect(seen.locations).toEqual(['/auth/signup']);
    expectButtons(true);
  });

  it('shows the email as pending, with every button disabled, until it is sent', async () => {
    const send = deferred();
    firebase.sendEmailVerification = vi.fn(() => send.promise);
    await signUp();
    expect(statusText()).toMatch(/sending/i);
    expectButtons(false);

    await act(async () => send.resolve());

    expect(statusText()).toBe('Verification email sent.');
    expectButtons(true);
  });

  it('opens the dashboard with a named profile once verified, and not before', async () => {
    await signUp();
    await click(CONFIRM);
    expect(statusText()).toMatch(NOT_VERIFIED_YET);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(firebase.nextUser.getIdToken).not.toHaveBeenCalled();
    expectNoApiUse();

    verifyOnServer();
    await click(CONFIRM);

    await profileText(`uid-new: ${NAME}`);
    expect(firebase.nextUser.reload).toHaveBeenCalledTimes(2);
    expect(firebase.nextUser.getIdToken).toHaveBeenCalledWith(true);
    expect(seen.exchanges).toEqual([{ uid: 'uid-new', verified: true, fullName: NAME }]);
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
    expect(firebase.sendEmailVerification).toHaveBeenCalledTimes(1);
    expect(seen.locations).toEqual(['/auth/signup', '/dashboard']);
  });

  it('still sends the email and keeps the name when updateProfile rejects', async () => {
    firebase.updateProfile = vi.fn(async () => { throw new Error('synthetic failure'); });
    await signUp();
    expect(firebase.sendEmailVerification).toHaveBeenCalledTimes(1);
    expect(statusText()).toBe('Verification email sent.');
    expect(firebase.nextUser.displayName).toBeNull();

    verifyOnServer();
    await click(CONFIRM);

    await profileText(`uid-new: ${NAME}`);
    expect(seen.exchanges[0].fullName).toBe(NAME);
  });

  it('keeps the name for a later visit', async () => {
    const firstVisit = renderApp('/auth/signup');
    await submitSignup();
    await findVerifyPage();
    expect(firebase.updateProfile.mock.calls).toEqual([[firebase.nextUser, { displayName: NAME }]]);

    firstVisit.unmount();
    clearAppJwt();
    firebase.auth.currentUser = createUser('uid-new', { verified: false });
    renderApp('/auth/login');
    await findVerifyPage();
    verifyOnServer();
    await click(CONFIRM);

    await profileText(`uid-new: ${NAME}`);
    expect(seen.exchanges).toEqual([{ uid: 'uid-new', verified: true, fullName: NAME }]);
  });

  it.each([
    ['auth/too-many-requests', /too many emails/i],
    ['auth/network-request-failed', /check your connection/i],
    ['auth/internal-error', /could not be sent/i],
    [undefined, /could not be sent/i],
  ])('explains a failed send (%s), and Resend recovers', async (code, text) => {
    firebase.sendEmailVerification = vi.fn(async () => {})
      .mockImplementationOnce(async () => { throw Object.assign(new Error('synthetic failure'), { code }); });
    await signUp();
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('alert')).not.toHaveTextContent('synthetic failure');
    expect(statusText()).toBe('');
    expectButtons(true);

    await click(RESEND);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(statusText()).toBe('Verification email sent.');
    expect(firebase.sendEmailVerification).toHaveBeenCalledTimes(2);
    expectNoApiUse();
  });
});

describe('the check-your-email page', () => {
  it('disables its buttons and reports progress while resending', async () => {
    await logIn();
    expect(statusText()).toBe('');
    const send = deferred();
    firebase.sendEmailVerification = vi.fn(() => send.promise);

    await click(RESEND);
    expectButtons(false);
    expect(statusText()).toMatch(/sending/i);
    await click(RESEND);
    expect(firebase.sendEmailVerification.mock.calls).toEqual([[firebase.nextUser]]);
    await act(async () => send.resolve());

    expectButtons(true);
    expect(statusText()).toBe('Verification email sent.');
  });

  it('disables its buttons and reports progress while checking', async () => {
    await logIn();
    const reload = deferred();
    firebase.nextUser.reload.mockImplementationOnce(() => reload.promise);

    await click(CONFIRM);
    expectButtons(false);
    expect(statusText()).toMatch(/checking/i);
    await click(CONFIRM);
    expect(firebase.nextUser.reload).toHaveBeenCalledTimes(1);
    await act(async () => reload.resolve());

    expectButtons(true);
    expect(statusText()).toMatch(NOT_VERIFIED_YET);
    expectNoApiUse();
  });

  it('is shown after an unverified login, without an email or API call', async () => {
    await logIn();
    await settle();

    expectNoApiUse();
    expect(firebase.sendEmailVerification).not.toHaveBeenCalled();
    expect(seen.locations).toEqual(['/auth/login']);
  });

  it.each([
    ['/auth/login', ['/auth/login']],
    ['/auth/signup', ['/auth/signup']],
    ['/dashboard', ['/dashboard', '/auth/login']],
  ])('is shown when an unverified user loads %s, without a loop, email or API call', async (path, locations) => {
    firebase.auth.currentUser = firebase.nextUser;
    renderApp(path);
    await findVerifyPage();
    await settle();

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Check your email' }));
    expect(seen.locations).toEqual(locations);
    expectNoApiUse();
    expect(firebase.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('is skipped by a user verified elsewhere whose token is out of date', async () => {
    firebase.auth.currentUser = createUser('uid-new', {
      verified: true, cachedVerified: true, tokenVerified: false,
    });
    verifyOnServer();
    renderApp('/dashboard');

    await profileText('uid-new: null');
    expect(seen.exchanges.map(({ verified }) => verified)).toEqual([false, true]);
    expect(firebase.auth.currentUser.getIdToken).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
    expect(seen.locations).toEqual(['/dashboard']);
  });

  it('is shown after exactly two exchanges when only this device thinks the user is verified', async () => {
    firebase.auth.currentUser = createUser('uid-new', { verified: false, cachedVerified: true });
    renderApp('/dashboard');
    await findVerifyPage();
    await settle();

    expect(seen.exchanges).toHaveLength(2);
    expect(seen.dashboardMounts).toBe(0);
    expect(callsTo('/users/uid-new')).toEqual([]);
    expect(firebase.signOut).not.toHaveBeenCalled();
    expect(seen.locations).toEqual(['/dashboard', '/auth/login']);
  });

  // IDENTITY-009: a failed read shows an explanation, not a dashboard without a profile.
  it.each([
    ['succeeds', async (uid) => reply(200, { firebase_uid: uid, full_name: NAME }), true],
    ['fails', async () => reply(500), false],
  ])('stays pending until the first profile read %s, then opens the dashboard or explains', async (_label, answer, opens) => {
    const read = deferred();
    api.profile = vi.fn(async (uid) => { await read.promise; return answer(uid); });
    await logIn();
    verifyOnServer();
    await click(CONFIRM);
    await waitFor(() => expect(api.profile).toHaveBeenCalledTimes(1));
    expectButtons(false);
    expect(seen.dashboardMounts).toBe(0);

    await act(async () => read.resolve());

    if (opens) {
      await profileText(`uid-new: ${NAME}`);
      expect(seen.dashboardMounts).toBe(1);
    } else {
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your account/i);
      expect(seen.dashboardMounts).toBe(0);
    }
  });

  it('stays, without an alert, when the server still answers that the email is not verified', async () => {
    await logIn();
    verifyOnServer();
    api.exchange = async () => notVerified();

    await click(CONFIRM);

    expect(statusText()).toMatch(NOT_VERIFIED_YET);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(seen.exchanges).toHaveLength(2);
    expect(seen.dashboardMounts).toBe(0);
  });

  it('signs out with the server message when confirming gets 409', async () => {
    await logIn();
    verifyOnServer();
    api.exchange = async () => reply(409, { message: ALREADY_USED });

    await click(CONFIRM);

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(ALREADY_USED);
    expect(firebase.auth.currentUser).toBeNull();
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(callsTo('/logout')).toHaveLength(1);
    expect(seen.exchanges).toHaveLength(1);
    expect(seen.dashboardMounts).toBe(0);
  });

  it.each([
    ['400', async () => reply(400, { message: 'synthetic failure' })],
    ['429', async () => reply(429, { message: 'synthetic failure' })],
    ['500', async () => reply(500, { message: 'synthetic failure' })],
    ['no answer', async () => { throw new TypeError('synthetic network failure'); }],
  ])('stays and allows another try when confirming gets %s', async (_label, answer) => {
    await logIn();
    verifyOnServer();
    const accept = api.exchange;
    api.exchange = answer;
    await click(CONFIRM);
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be checked/i);
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(firebase.signOut).not.toHaveBeenCalled();
    expect(seen.exchanges).toHaveLength(1);
    expect(seen.dashboardMounts).toBe(0);
    expectButtons(true);

    api.exchange = accept;
    await click(CONFIRM);

    await profileText('uid-new: null');
  });

  it.each([
    ['reload', () => firebase.nextUser.reload],
    ['getIdToken', () => firebase.nextUser.getIdToken],
  ])('explains when %s rejects and allows another try', async (_label, method) => {
    await logIn();
    verifyOnServer();
    method().mockImplementationOnce(async () => { throw new Error('synthetic failure'); });
    await click(CONFIRM);
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be checked/i);
    expectNoApiUse();
    expectButtons(true);

    await click(CONFIRM);

    await profileText('uid-new: null');
  });

  it('returns to the login form on Sign out', async () => {
    await logIn();

    await click('Sign out');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(firebase.auth.currentUser).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(seen.dashboardMounts).toBe(0);
  });

  it('disables its buttons while signing out', async () => {
    await logIn();
    const logout = deferred();
    api.logout = () => logout.promise;

    await click('Sign out');
    expectButtons(false);
    await act(async () => logout.resolve(reply(204)));

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('returns a deep-linked user to the login form on Sign out', async () => {
    firebase.auth.currentUser = firebase.nextUser;
    renderApp('/dashboard');
    await findVerifyPage();

    await click('Sign out');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(seen.locations).toEqual(['/dashboard', '/auth/login']);
  });

  // The sign-up route stays, so the form to correct the address is shown.
  it('returns a new sign-up to the sign-up form on Sign out, without the old status', async () => {
    await signUp();
    await click('Sign out');

    expect(await screen.findByRole('button', { name: /create account/i })).toBeInTheDocument();
    firebase.nextUser = createUser('uid-new', { verified: false });
    await act(async () => setCurrentUser(firebase.nextUser));
    await expectUntouchedPage('uid-new@example.test');
  });

  // IDENTITY-012: only a failed Firebase sign-out leaves this page open.
  it.each([
    ['Firebase rejects', () => { firebase.signOut.mockImplementationOnce(async () => { throw new Error('synthetic'); }); }],
    [
      'Firebase rejects and the API cannot be reached',
      () => {
        api.logout = async () => { throw new TypeError('synthetic failure'); };
        firebase.signOut.mockImplementationOnce(async () => { throw new Error('synthetic'); });
      },
    ],
  ])('explains a failed sign-out when %s and allows another try', async (_label, fail) => {
    await logIn();
    const logout = api.logout;
    fail();
    await click('Sign out');
    expect(firebase.auth.currentUser.uid).toBe('uid-new');
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be signed out/i);
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expectButtons(true);

    api.logout = logout;
    await click('Sign out');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('signs out of Firebase and says the server did not confirm it when the API cannot be reached', async () => {
    await logIn();
    api.logout = async () => { throw new TypeError('synthetic failure'); };
    await click('Sign out');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(firebase.auth.currentUser).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are signed out on this device, but the server could not confirm it.'
    );
  });

  it('explains a 409 even when Firebase sign-out fails', async () => {
    await logIn();
    verifyOnServer();
    api.exchange = async () => reply(409, { message: ALREADY_USED });
    firebase.signOut = vi.fn(async () => { throw new Error('synthetic failure'); });
    await click(CONFIRM);
    await settle();
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expectButtons(true);

    expect(screen.queryByRole('alert')).toBeInTheDocument();
  });
});

describe('a user switch', () => {
  const CONFLICT_REPLY = () => reply(409, { message: ALREADY_USED });
  const OK_REPLY = () => reply(200);

  // Confirms as uid-new and stops at its exchange.
  async function holdConfirm() {
    await logIn();
    verifyOnServer();
    const exchange = deferred();
    const accept = api.exchange;
    api.exchange = (request) => (request.uid === 'uid-new' ? exchange.promise : accept(request));
    await click(CONFIRM);
    expect(seen.exchanges).toHaveLength(1);
    return exchange;
  }

  it.each([
    ['409', CONFLICT_REPLY],
    ['success', OK_REPLY],
    ['500', () => reply(500)],
    ['403', () => notVerified()],
  ])('while confirming (%s) does not touch another unverified user', async (_label, answer) => {
    const exchange = await holdConfirm();
    await switchTo('uid-two', { verified: false });

    await act(async () => exchange.resolve(answer()));

    await expectUntouchedPage('uid-two@example.test');
    expect(firebase.auth.currentUser.uid).toBe('uid-two');
    expect(firebase.signOut).not.toHaveBeenCalled();
    expect(callsTo('/logout')).toEqual([]);
    expect(callsTo('/users/uid-new')).toEqual([]);
    expect(seen.dashboardMounts).toBe(0);
  });

  it.each([
    ['409', CONFLICT_REPLY],
    ['success', OK_REPLY],
  ])('while confirming (%s) does not disturb the dashboard of a verified user', async (_label, answer) => {
    const exchange = await holdConfirm();
    await switchTo('uid-two');
    await profileText('uid-two: null');

    await act(async () => exchange.resolve(answer()));
    await settle();

    await profileText('uid-two: null');
    expect(firebase.auth.currentUser.uid).toBe('uid-two');
    expect(firebase.signOut).not.toHaveBeenCalled();
    expect(callsTo('/logout')).toEqual([]);
    expect(callsTo('/users/uid-new')).toEqual([]);
    expect(seen.dashboardMounts).toBe(1);
  });

  it.each([
    ['reload', () => firebase.nextUser.reload],
    ['getIdToken', () => firebase.nextUser.getIdToken],
  ])('during %s makes no exchange', async (_label, method) => {
    await logIn();
    verifyOnServer();
    const step = deferred();
    const real = method().getMockImplementation();
    method().mockImplementationOnce(async (...args) => { await step.promise; return real(...args); });
    await click(CONFIRM);
    await switchTo('uid-two', { verified: false });

    await act(async () => step.resolve());

    await expectUntouchedPage('uid-two@example.test');
    expectNoApiUse();
  });

  it('lets the second user confirm with their own session and without the first name', async () => {
    await signUp();
    await switchTo('uid-two', { verified: false });
    verifyOnServer('uid-two');

    await click(CONFIRM);

    await profileText('uid-two: null');
    expect(seen.exchanges).toEqual([{ uid: 'uid-two', verified: true, fullName: null }]);
  });

  it.each([
    ['succeeds', (send) => send.resolve()],
    ['fails', (send) => send.reject(Object.assign(new Error('synthetic'), { code: 'auth/too-many-requests' }))],
  ])('during a pending Resend that %s shows nothing to the other user', async (_label, finish) => {
    await logIn();
    const send = deferred();
    firebase.sendEmailVerification = vi.fn(() => send.promise);
    await click(RESEND);
    await switchTo('uid-two', { verified: false });
    await expectUntouchedPage('uid-two@example.test');

    await act(async () => finish(send));

    await expectUntouchedPage('uid-two@example.test');
    expect(firebase.sendEmailVerification.mock.calls.map(([user]) => user.uid)).toEqual(['uid-new']);
  });

  it.each([
    ['updateProfile', 'updateProfile'],
    ['the send', 'sendEmailVerification'],
  ])('during %s at sign-up shows nothing to the other user', async (_label, method) => {
    const step = deferred();
    firebase[method] = vi.fn(() => step.promise);
    await signUp();
    await switchTo('uid-two', { verified: false });
    await expectUntouchedPage('uid-two@example.test');

    await act(async () => step.resolve());

    await expectUntouchedPage('uid-two@example.test');
    // Never an email to the other user.
    expect(firebase.sendEmailVerification.mock.calls.map(([user]) => user.uid)).toEqual(['uid-new']);
    expectNoApiUse();
  });

  it('keeps the other user\'s own pending Resend when an earlier one finishes', async () => {
    const sends = { 'uid-new': deferred(), 'uid-two': deferred() };
    firebase.sendEmailVerification = vi.fn(({ uid }) => sends[uid].promise);
    await logIn();
    await click(RESEND);
    await switchTo('uid-two', { verified: false });
    await click(RESEND);

    await act(async () => sends['uid-new'].resolve());
    await settle();

    expect(statusText()).toMatch(/sending/i);
    expectButtons(false);
    await act(async () => sends['uid-two'].resolve());
    expect(statusText()).toBe('Verification email sent.');
  });

  it('while updateProfile is pending does not re-enable the other user\'s pending Resend', async () => {
    const profile = deferred();
    const sends = { 'uid-new': deferred(), 'uid-two': deferred() };
    firebase.updateProfile = vi.fn(() => profile.promise);
    firebase.sendEmailVerification = vi.fn(({ uid }) => sends[uid].promise);
    await signUp();
    await switchTo('uid-two', { verified: false });
    await click(RESEND);
    expectButtons(false);
    await act(async () => profile.resolve());
    await settle();

    expectButtons(false);
  });

  it('keeps the buttons usable after signing out elsewhere during updateProfile, then in again', async () => {
    const profile = deferred();
    firebase.updateProfile = vi.fn(() => profile.promise);
    await signUp();
    await act(async () => setCurrentUser(null));
    await act(async () => profile.resolve());
    await settle();
    expect(firebase.sendEmailVerification).toHaveBeenCalledTimes(1);
    await act(async () => setCurrentUser(createUser('uid-new', { verified: false })));
    await findVerifyPage();
    await settle();

    expectButtons(true);
  });

  it('keeps the buttons usable on return when a send ended while another user was signed in', async () => {
    const send = deferred();
    firebase.sendEmailVerification = vi.fn(() => send.promise);
    await logIn();
    await click(RESEND);
    await switchTo('uid-two', { verified: false });
    await act(async () => send.resolve());
    await switchTo('uid-new', { verified: false });
    await findVerifyPage();
    await settle();

    expectButtons(true);
  });

  it('during a profile read never shows that profile to the other user', async () => {
    await logIn();
    verifyOnServer();
    const read = deferred();
    api.profile = vi.fn(async () => reply(500)).mockImplementationOnce(() => read.promise);
    await click(CONFIRM);
    await waitFor(() => expect(api.profile).toHaveBeenCalledTimes(1));
    await switchTo('uid-two', { verified: false });
    await act(async () => read.resolve(reply(200, { firebase_uid: 'uid-new', full_name: 'First User' })));
    await expectUntouchedPage('uid-two@example.test');
    verifyOnServer('uid-two');
    await click(CONFIRM);
    // The second user's own read fails: IDENTITY-009 explains instead of opening the dashboard.
    await screen.findByRole('alert');
    await settle();

    expect(seen.dashboardMounts).toBe(0);
    expect(screen.queryByText(/First User/)).not.toBeInTheDocument();
  });

  it('during a successful confirm lets the other user get their own session back', async () => {
    const exchange = await holdConfirm();
    await switchTo('uid-two');
    await profileText('uid-two: null');
    expect(seen.session).toBe('uid-two');
    await act(async () => exchange.resolve(reply(200)));
    await settle();

    await click('Refresh');
    await settle();
    expect(screen.queryByText('Refresh failed')).not.toBeInTheDocument();
  });
});

describe('Google', () => {
  it.each([
    ['sign-up', '/auth/signup'],
    ['sign-in', '/auth/login'],
  ])('%s goes straight to the dashboard without an email', async (_label, path) => {
    firebase.nextUser = createUser('uid-google');
    renderApp(path);
    await screen.findByRole('button', { name: /continue with google/i });
    // Google sign-up needs the terms box (IDENTITY-021); sign-in has none.
    const terms = screen.queryByLabelText(/i agree to the/i);
    if (terms) fireEvent.click(terms);

    await click(/continue with google/i);

    await profileText('uid-google: null');
    await settle();
    expect(firebase.sendEmailVerification).not.toHaveBeenCalled();
    expect(firebase.updateProfile).not.toHaveBeenCalled();
    expect(seen.locations).toEqual([path, '/dashboard']);
    expect(seen.exchanges.every(({ verified }) => verified)).toBe(true);
  });
});

describe('exchangeFirebaseTokenForJwt', () => {
  const signedIn = (options) => { firebase.auth.currentUser = createUser('uid-one', options); };
  const oldToken = { verified: true, cachedVerified: true, tokenVerified: false };

  beforeEach(() => { firebase.accounts = {}; });

  it('rejects with the code, status and message, and does not retry an unverified user', async () => {
    signedIn({ verified: false });

    await expect(exchangeFirebaseTokenForJwt()).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED', status: 403, message: 'Synthetic refusal',
    });
    expect(seen.exchanges).toHaveLength(1);
    expect(firebase.auth.currentUser.getIdToken).not.toHaveBeenCalledWith(true);
  });

  it('retries once with a fresh token and the same name', async () => {
    signedIn(oldToken);

    await expect(exchangeFirebaseTokenForJwt(NAME)).resolves.toBe('cookie_session');
    expect(seen.exchanges).toEqual([
      { uid: 'uid-one', verified: false, fullName: NAME },
      { uid: 'uid-one', verified: true, fullName: NAME },
    ]);
  });

  it('retries at most once', async () => {
    signedIn(oldToken);
    api.exchange = async () => notVerified();

    await expect(exchangeFirebaseTokenForJwt()).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED', status: 403 });
    expect(seen.exchanges).toHaveLength(2);
  });

  it('reports the error of the retry', async () => {
    signedIn(oldToken);
    api.exchange = vi.fn(async () => reply(409, { message: ALREADY_USED })).mockImplementationOnce(async () => notVerified());

    const error = await exchangeFirebaseTokenForJwt().catch((caught) => caught);
    expect(error).toMatchObject({ status: 409, message: ALREADY_USED });
    expect(error.code).toBeUndefined();
  });

  it.each([
    ['403 without a code', () => reply(403, { message: 'synthetic' })],
    ['403 with another code', () => reply(403, { code: 'SYNTHETIC_OTHER', message: 'synthetic' })],
    ['409', () => reply(409, { message: 'synthetic' })],
    ['a body that is not JSON', () => ({ ...reply(403), json: async () => { throw new SyntaxError('synthetic'); } })],
  ])('does not retry %s', async (_label, answer) => {
    signedIn(oldToken);
    api.exchange = async () => answer();

    await expect(exchangeFirebaseTokenForJwt()).rejects.toThrow();
    expect(seen.exchanges).toHaveLength(1);
  });

  it('does not retry for a user who is no longer signed in', async () => {
    signedIn(oldToken);
    const first = firebase.auth.currentUser;
    const refresh = deferred();
    first.getIdToken.mockImplementation((force) => (
      force ? refresh.promise : Promise.resolve(JSON.stringify({ uid: 'uid-one', verified: false }))
    ));
    const result = exchangeFirebaseTokenForJwt().catch((error) => error);
    await waitFor(() => expect(first.getIdToken).toHaveBeenCalledWith(true));
    firebase.auth.currentUser = createUser('uid-two');
    refresh.resolve(JSON.stringify({ uid: 'uid-one', verified: true }));

    expect(await result).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(seen.exchanges).toHaveLength(1);
  });
});
