// Login page, including IDENTITY-004 (Forgot password?). Firebase is mocked;
// all data is synthetic.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const firebaseApp = vi.hoisted(() => ({ auth: null, hasFirebaseConfig: false }));

// Getters, so each test can switch Firebase on or off.
vi.mock('../src/firebase', () => ({
  get auth() { return firebaseApp.auth; },
  get hasFirebaseConfig() { return firebaseApp.hasFirebaseConfig; },
}));
vi.mock('../src/utils/auth', () => ({ exchangeFirebaseTokenForJwt: vi.fn() }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  browserLocalPersistence: {},
  sendPasswordResetEmail: vi.fn(),
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
}));

import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import Login from '../src/pages/auth/Login.jsx';

const SYNTHETIC_AUTH = { name: 'synthetic-auth' };
const NEUTRAL = "If an account exists for that email, we've sent a reset link.";
const NO_EMAIL = 'Enter your email address above, then select Forgot password? again.';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function renderLogin() {
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

const forgotButton = () => screen.getByRole('button', { name: /forgot password\?|sending\.\.\./i });

function typeEmail(value) {
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value } });
}

async function requestReset(email) {
  typeEmail(email);
  await act(async () => { fireEvent.click(forgotButton()); });
}

const firebaseError = (code) => Object.assign(new Error('synthetic firebase failure'), { code });

beforeEach(() => {
  firebaseApp.auth = null;
  firebaseApp.hasFirebaseConfig = false;
  vi.mocked(sendPasswordResetEmail).mockReset();
  vi.mocked(signInWithEmailAndPassword).mockReset();
});

describe('login flow', () => {
  it('shows firebase configuration error when unavailable', async () => {
    renderLogin();

    // Both fields are required; the browser blocks an empty submit.
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'synthetic-password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/firebase is not configured/i)).toBeInTheDocument();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});

describe('IDENTITY-004: Forgot password?', () => {
  beforeEach(() => {
    firebaseApp.auth = SYNTHETIC_AUTH;
    firebaseApp.hasFirebaseConfig = true;
  });

  function expectNeutral() {
    expect(screen.getByRole('status')).toHaveTextContent(NEUTRAL);
    expect(document.querySelector('.auth-error')).toBeNull();
  }

  it('sends a reset email to the address without spaces and shows the neutral message', async () => {
    sendPasswordResetEmail.mockResolvedValue(undefined);
    renderLogin();

    // A type="email" input already drops the spaces (in jsdom as in browsers), so
    // this cannot show that Login's own trim() runs.
    await requestReset('  person@example.test  ');

    expect(sendPasswordResetEmail.mock.calls).toEqual([[SYNTHETIC_AUTH, 'person@example.test']]);
    expectNeutral();
    expect(forgotButton()).toHaveTextContent('Forgot password?');
    expect(forgotButton()).toBeEnabled();
  });

  it.each([
    ['auth/user-not-found', firebaseError('auth/user-not-found')],
    ['an unknown code', firebaseError('auth/internal-error')],
    ['an error without a code', new Error('synthetic')],
  ])('shows the same neutral message for %s', async (_label, error) => {
    sendPasswordResetEmail.mockRejectedValue(error);
    renderLogin();

    await requestReset('person@example.test');

    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expectNeutral();
  });

  it.each([
    ['auth/invalid-email', 'Enter a valid email address.'],
    ['auth/missing-email', 'Enter a valid email address.'],
    ['auth/network-request-failed', 'We could not reach the server. Check your connection and try again.'],
    ['auth/too-many-requests', 'Too many attempts. Wait a few minutes, then try again.'],
  ])('shows a real error for %s', async (code, message) => {
    sendPasswordResetEmail.mockRejectedValue(firebaseError(code));
    renderLogin();

    await requestReset('person@example.test');

    expect(screen.getByText(message)).toHaveClass('auth-error');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(forgotButton()).toBeEnabled();
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['without @', 'person.example.test'],
    ['without a domain', 'person@'],
  ])('does not call Firebase for an email that is %s', async (_label, email) => {
    renderLogin();

    await requestReset(email);

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(screen.getByText(NO_EMAIL)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not call Firebase when it is not configured', async () => {
    firebaseApp.auth = null;
    firebaseApp.hasFirebaseConfig = false;
    renderLogin();

    await requestReset('person@example.test');

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(screen.getByText(/firebase is not configured/i)).toBeInTheDocument();
  });

  it('shows Sending... and stays disabled until Firebase answers', async () => {
    const send = deferred();
    sendPasswordResetEmail.mockReturnValue(send.promise);
    renderLogin();

    await requestReset('person@example.test');

    expect(forgotButton()).toHaveTextContent('Sending...');
    expect(forgotButton()).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(forgotButton());
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);

    await act(async () => send.resolve());

    expect(forgotButton()).toHaveTextContent('Forgot password?');
    expect(forgotButton()).toBeEnabled();
    expectNeutral();
  });

  it('sends once for two clicks made before the page re-renders', async () => {
    const send = deferred();
    sendPasswordResetEmail.mockReturnValue(send.promise);
    renderLogin();
    typeEmail('person@example.test');

    // Both clicks land before React disables the button, so only the ref can stop the second.
    await act(async () => {
      const button = forgotButton();
      button.click();
      button.click();
    });

    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    await act(async () => send.resolve());

    // Free again once the first request has finished.
    await act(async () => { fireEvent.click(forgotButton()); });
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(2);
  });

  it('clears an earlier error when the next request succeeds', async () => {
    sendPasswordResetEmail.mockRejectedValueOnce(firebaseError('auth/too-many-requests'));
    sendPasswordResetEmail.mockResolvedValueOnce(undefined);
    renderLogin();

    await requestReset('person@example.test');
    expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
    await act(async () => { fireEvent.click(forgotButton()); });

    expect(screen.queryByText(/too many attempts/i)).not.toBeInTheDocument();
    expectNeutral();
  });
});
