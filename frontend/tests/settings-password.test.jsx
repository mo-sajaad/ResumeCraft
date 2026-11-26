// IDENTITY-005 in the browser: after a password change, Settings ends the other
// API sessions, then signs this device in again with a fresh ID token. Uses the
// real utils/auth; Firebase, the auth context and the API are fakes. All data is
// synthetic.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  events: [],
  auth: { currentUser: null },
  updatePassword: null,
}));

vi.mock('../src/firebase', () => ({
  auth: fakes.auth,
  hasFirebaseConfig: true,
  sendPasswordResetEmail: vi.fn(),
  updatePassword: (...args) => fakes.updatePassword(...args),
}));
vi.mock('../src/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-one', email: 'uid-one@example.test', metadata: {} },
    profile: { firebase_uid: 'uid-one', email: 'uid-one@example.test' },
    logout: vi.fn(),
  }),
}));

import { clearAppJwt } from '../src/utils/auth';
import Settings from '../src/pages/Settings.jsx';

const NEW_PASSWORD = 'synthetic-password-2';
const SUCCESS = 'Preferences and password updated successfully.';
const PARTIAL = 'Your password was changed, but other devices could not be signed out. Log out, then sign in again.';
const REVOKE = 'POST /api/auth/sessions/revoke';
// Exchanges carry the ID token; only the refreshed one proves the new password.
const FRESH_EXCHANGE = 'POST /api/auth/exchange synthetic-id-token-1';

const reply = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// Replaceable per test; each answers one kind of request.
let api;

beforeEach(() => {
  clearAppJwt();
  fakes.events.length = 0;
  // Like the SDK: a forced refresh issues a new token, which later calls reuse.
  let refreshes = 0;
  fakes.auth.currentUser = {
    uid: 'uid-one',
    getIdToken: vi.fn(async (force) => {
      if (force) {
        refreshes += 1;
        fakes.events.push('getIdToken(true)');
      }
      return `synthetic-id-token-${refreshes}`;
    }),
  };
  fakes.updatePassword = vi.fn(async () => { fakes.events.push('updatePassword'); });
  api = {
    exchange: () => reply(200),
    preferences: () => reply(200, {}),
    revoke: () => reply(204),
  };
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const token = url === '/api/auth/exchange' ? ` ${JSON.parse(init.body).firebaseToken}` : '';
    fakes.events.push(`${init.method || 'GET'} ${url}${token}`);
    if (url === '/api/auth/exchange') return api.exchange();
    if (url === '/api/users/uid-one/preferences') return api.preferences();
    if (url === '/api/auth/sessions/revoke') return api.revoke(init);
    throw new Error(`Unexpected request: ${url}`);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderSettings() {
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

async function changePassword(password = NEW_PASSWORD, confirm = password) {
  renderSettings();
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); });
}

// What happened once Firebase accepted the new password.
const afterUpdate = () => fakes.events.slice(fakes.events.indexOf('updatePassword'));
const revokeCalls = () => fetch.mock.calls.filter(([url]) => url === '/api/auth/sessions/revoke');

describe('IDENTITY-005: password change in Settings', () => {
  it('revokes all sessions, refreshes the ID token, then exchanges it again', async () => {
    await changePassword();

    expect(fakes.updatePassword).toHaveBeenCalledWith(fakes.auth.currentUser, NEW_PASSWORD);
    expect(afterUpdate()).toEqual(['updatePassword', REVOKE, 'getIdToken(true)', FRESH_EXCHANGE]);
    const [, init] = revokeCalls()[0];
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(screen.getByText(SUCCESS)).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm password')).toHaveValue('');
  });

  it.each([
    ['the server refuses', () => reply(500, { message: 'synthetic failure' })],
    ['the request fails', () => Promise.reject(new TypeError('synthetic network failure'))],
  ])('warns that other devices are still signed in when %s', async (_label, revoke) => {
    api.revoke = revoke;

    await changePassword();

    expect(fakes.updatePassword).toHaveBeenCalledTimes(1);
    expect(screen.getByText(PARTIAL)).toBeInTheDocument();
    expect(screen.queryByText(SUCCESS)).not.toBeInTheDocument();
    // No fresh token or new session after a failed revoke.
    expect(afterUpdate()).toEqual(['updatePassword', REVOKE]);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('warns when the revoke is refused even after signing in again', async () => {
    api.revoke = () => reply(401, { message: 'synthetic refusal' });

    await changePassword();

    expect(revokeCalls()).toHaveLength(2);
    expect(screen.getByText(PARTIAL)).toBeInTheDocument();
    expect(screen.queryByText(SUCCESS)).not.toBeInTheDocument();
  });

  it('warns when this device cannot exchange the fresh token', async () => {
    let exchanges = 0;
    api.exchange = () => {
      exchanges += 1;
      // The first exchange is the one before preferences are saved.
      return exchanges === 1 ? reply(200) : reply(401, { message: 'synthetic refusal' });
    };

    await changePassword();

    expect(afterUpdate()).toEqual(['updatePassword', REVOKE, 'getIdToken(true)', FRESH_EXCHANGE]);
    expect(screen.getByText(PARTIAL)).toBeInTheDocument();
    expect(screen.queryByText(SUCCESS)).not.toBeInTheDocument();
  });

  it.each([
    ['auth/requires-recent-login', 'Please log in again before changing your password.'],
    ['auth/weak-password', 'synthetic firebase failure'],
  ])('does not revoke when Firebase refuses the password with %s', async (code, message) => {
    fakes.updatePassword = vi.fn(async () => {
      throw Object.assign(new Error('synthetic firebase failure'), { code });
    });

    await changePassword();

    expect(fakes.updatePassword).toHaveBeenCalledTimes(1);
    expect(revokeCalls()).toEqual([]);
    expect(fakes.events).not.toContain('getIdToken(true)');
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(PARTIAL)).not.toBeInTheDocument();
  });

  it.each([
    ['too short', 'short', 'short'],
    ['not confirmed', NEW_PASSWORD, 'synthetic-password-3'],
  ])('does not change or revoke anything when the password is %s', async (_label, password, confirm) => {
    await changePassword(password, confirm);

    expect(fakes.updatePassword).not.toHaveBeenCalled();
    expect(revokeCalls()).toEqual([]);
  });

  it('does not revoke when only preferences are saved', async () => {
    await changePassword('', '');

    expect(fakes.updatePassword).not.toHaveBeenCalled();
    expect(revokeCalls()).toEqual([]);
    expect(screen.getByText('Preferences saved.')).toBeInTheDocument();
  });
});
