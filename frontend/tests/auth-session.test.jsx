// IDENTITY-002 and 003 in the browser: profile after sign-up, refused exchanges.
// Firebase and the API are fakes; all data is synthetic.
import process from 'node:process';
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  auth: { currentUser: null },
  listener: null,
  // Set by each test: the user the next sign-in or sign-up produces.
  nextUser: null,
  signOut: null,
  updateProfile: null,
}));

vi.mock('../src/firebase', () => ({
  auth: firebase.auth,
  hasFirebaseConfig: true,
  signOut: (...args) => firebase.signOut(...args),
}));
vi.mock('firebase/auth', () => {
  const signIn = async () => {
    firebase.auth.currentUser = firebase.nextUser;
    firebase.listener?.(firebase.nextUser);
    return { user: firebase.nextUser };
  };
  return {
    GoogleAuthProvider: vi.fn(),
    browserLocalPersistence: {},
    setPersistence: async () => {},
    signInWithPopup: signIn,
    signInWithEmailAndPassword: signIn,
    createUserWithEmailAndPassword: signIn,
    updateProfile: (...args) => firebase.updateProfile(...args),
    onAuthStateChanged: (_auth, listener) => {
      firebase.listener = listener;
      queueMicrotask(() => listener(firebase.auth.currentUser));
      return () => { firebase.listener = null; };
    },
  };
});

import { AuthProvider } from '../src/context/AuthProvider.jsx';
import { useAuth } from '../src/context/useAuth';
import Login from '../src/pages/auth/Login.jsx';
import Signup from '../src/pages/auth/Signup.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import RedirectIfAuth from '../src/routes/RedirectIfAuth.jsx';
import { clearAppJwt, exchangeFirebaseTokenForJwt } from '../src/utils/auth';

const CONFLICT = 'Synthetic conflict message';
const NAME = 'Jane Doe';

let api;

const reply = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createUser(uid) {
  return { uid, displayName: null, getIdToken: async () => `token-${uid}` };
}

// Lets promise chains that start from resolved fakes run to completion.
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setCurrentUser(user) {
  firebase.auth.currentUser = user;
  firebase.listener?.(user);
}

function callsTo(suffix) {
  return globalThis.fetch.mock.calls.filter(([url]) => url.endsWith(suffix));
}

beforeEach(() => {
  clearAppJwt();
  firebase.auth.currentUser = null;
  firebase.nextUser = createUser('uid-one');
  firebase.signOut = vi.fn(async () => setCurrentUser(null));
  firebase.updateProfile = vi.fn(async (user, { displayName }) => { user.displayName = displayName; });
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  // Default API: stores names per user and, like the server, keeps a stored
  // name when the exchange has none. Tests replace single handlers.
  const names = {};
  api = {
    exchange: async ({ uid, fullName }) => {
      names[uid] = fullName || names[uid] || null;
      return reply(200);
    },
    profile: async (uid) => reply(200, { firebase_uid: uid, full_name: names[uid] }),
    logout: async () => reply(204),
  };
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    if (url === '/api/auth/exchange') {
      const { firebaseToken, fullName } = JSON.parse(init.body);
      return api.exchange({ uid: firebaseToken.replace('token-', ''), fullName });
    }
    if (url === '/api/auth/logout') return api.logout();
    if (url.startsWith('/api/users/')) return api.profile(url.replace('/api/users/', ''));
    throw new Error(`Unexpected request: ${url}`);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Dashboard() {
  const { profile, logout, refreshProfile } = useAuth();
  const [refreshFailed, setRefreshFailed] = useState(false);
  return (
    <main aria-label="Dashboard">
      <p data-testid="profile">{profile ? `${profile.firebase_uid}: ${profile.full_name}` : 'no profile'}</p>
      {refreshFailed ? <p>Refresh failed</p> : null}
      <button type="button" onClick={() => refreshProfile().catch(() => setRefreshFailed(true))}>Refresh</button>
      <button type="button" onClick={logout}>Sign out</button>
    </main>
  );
}

function renderApp(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route element={<RedirectIfAuth />}>
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/signup" element={<Signup />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function submitSignup() {
  fireEvent.change(await screen.findByLabelText(/full name/i), { target: { value: NAME } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'jane@example.test' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'synthetic-password-1' } });
  fireEvent.click(screen.getByRole('checkbox'));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /create account/i })); });
}

async function submitLogin() {
  fireEvent.change(await screen.findByLabelText(/^email$/i), { target: { value: 'jane@example.test' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'synthetic-password-1' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^sign in$/i })); });
}

const profileText = async (text) => {
  await waitFor(() => expect(screen.getByTestId('profile')).toHaveTextContent(text));
};

// As in the Firebase SDK, updateProfile is a round trip that ends after the
// auth event, so the provider's own exchange has no name.
function holdUpdateProfile(finish = async (user, { displayName }) => { user.displayName = displayName; }) {
  const gate = deferred();
  firebase.updateProfile = vi.fn(async (...args) => {
    await gate.promise;
    return finish(...args);
  });
  return gate;
}

describe('IDENTITY-002: email sign-up ends with a named profile', () => {
  it('when the provider first loads the profile without a name', async () => {
    const gate = holdUpdateProfile();
    renderApp('/auth/signup');
    await submitSignup();
    await profileText('uid-one: null');

    await act(async () => gate.resolve());

    await profileText(`uid-one: ${NAME}`);
  });

  it('when the exchange without a name fails', async () => {
    const accept = api.exchange;
    api.exchange = async (request) => (request.fullName ? accept(request) : reply(400, { message: 'no name' }));
    const gate = holdUpdateProfile();
    renderApp('/auth/signup');
    await submitSignup();
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    await profileText('no profile');

    await act(async () => gate.resolve());

    await profileText(`uid-one: ${NAME}`);
  });

  it('when the first, nameless profile response arrives last', async () => {
    const slow = deferred();
    const slowRead = vi.fn(async () => ({ firebase_uid: 'uid-one', full_name: null }));
    const load = api.profile;
    api.profile = vi.fn(load).mockImplementationOnce(() => slow.promise);
    const gate = holdUpdateProfile();
    renderApp('/auth/signup');
    await submitSignup();
    await waitFor(() => expect(api.profile).toHaveBeenCalledTimes(1));
    await act(async () => gate.resolve());
    await profileText(`uid-one: ${NAME}`);

    await act(async () => slow.resolve({ ok: true, status: 200, json: slowRead }));
    await settle();

    expect(slowRead).toHaveBeenCalled();
    await profileText(`uid-one: ${NAME}`);
  });

  it('when updateProfile rejects', async () => {
    const gate = holdUpdateProfile(async () => { throw new Error('synthetic updateProfile failure'); });
    renderApp('/auth/signup');
    await submitSignup();
    await profileText('uid-one: null');

    await act(async () => gate.resolve());

    await profileText(`uid-one: ${NAME}`);
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

  async function expectRefused() {
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(CONFLICT);
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
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

  it('is also explained after sign-up', async () => {
    renderApp('/auth/signup');
    await refuseExchangeDuring(submitSignup);

    await expectRefused();
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
