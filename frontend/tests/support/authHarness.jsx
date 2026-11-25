// Shared setup for the sign-in tests: a fake API and form helpers. A test file
// must also mock '../src/firebase' and 'firebase/auth' with fakeFirebase.js.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';

import { clearAppJwt } from '../../src/utils/auth';
import TestApp from './TestApp.jsx';
import { resetFirebase } from './fakeFirebase.js';

export const NAME = 'Jane Doe';

// Handlers that tests may replace one by one, and what was observed.
export const api = {};
export const seen = {};

export const reply = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

export const notVerified = () => reply(403, { code: 'EMAIL_NOT_VERIFIED', message: 'Synthetic refusal' });

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

// Lets promise chains that start from resolved fakes run to completion.
export async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export function callsTo(suffix) {
  return globalThis.fetch.mock.calls.filter(([url]) => url.endsWith(suffix));
}

export function setUpSignInTest() {
  clearAppJwt();
  resetFirebase();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  Object.assign(seen, { exchanges: [], dashboardMounts: 0, locations: [], session: null });

  // Like the server: refuses unverified tokens, keeps a stored name when the
  // exchange has none, and knows users only by the session cookie.
  const names = {};
  Object.assign(api, {
    exchange: async ({ uid, verified, fullName }) => {
      if (!verified) return notVerified();
      names[uid] = fullName || names[uid] || null;
      return reply(200);
    },
    profile: async (uid) => (
      uid === seen.session ? reply(200, { firebase_uid: uid, full_name: names[uid] }) : reply(403)
    ),
    logout: async () => reply(204),
  });

  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    if (url === '/api/auth/exchange') {
      const { firebaseToken, fullName } = JSON.parse(init.body);
      const request = { ...JSON.parse(firebaseToken), fullName };
      seen.exchanges.push(request);
      const response = await api.exchange(request);
      if (response.ok) seen.session = request.uid;
      return response;
    }
    if (url === '/api/auth/logout') {
      const response = await api.logout();
      seen.session = null;
      return response;
    }
    if (url.startsWith('/api/users/')) return api.profile(url.replace('/api/users/', ''));
    throw new Error(`Unexpected request: ${url}`);
  }));
}

export function tearDownSignInTest() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

export function renderApp(path) {
  return render(
    <TestApp
      path={path}
      onDashboardMount={() => { seen.dashboardMounts += 1; }}
      onLocation={(pathname) => { seen.locations.push(pathname); }}
    />
  );
}

export async function submitSignup() {
  fireEvent.change(await screen.findByLabelText(/full name/i), { target: { value: NAME } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'jane@example.test' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'synthetic-password-1' } });
  fireEvent.click(screen.getByRole('checkbox'));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /create account/i })); });
}

export async function submitLogin() {
  fireEvent.change(await screen.findByLabelText(/^email$/i), { target: { value: 'jane@example.test' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'synthetic-password-1' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^sign in$/i })); });
}

export const click = (name) => act(async () => {
  fireEvent.click(screen.getByRole('button', { name }));
});

export const CONFIRM = /verified my email/i;

export const findVerifyPage = () => screen.findByRole('heading', { name: 'Check your email' });

export async function profileText(text) {
  await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent(text));
}
