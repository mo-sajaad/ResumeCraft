// IDENTITY-017: sign-in, sign-up and Settings announce errors, link them to the
// fields they are about, focus the first such field and set autocomplete. Firebase,
// the auth context and the API helper are mocked; all data is synthetic.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const fakes = vi.hoisted(() => ({ auth: { name: 'synthetic-auth', currentUser: null } }));

vi.mock('../src/firebase', () => ({
  auth: fakes.auth,
  hasFirebaseConfig: true,
  sendPasswordResetEmail: vi.fn(),
  updatePassword: vi.fn(),
}));
vi.mock('../src/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-one', email: 'uid-one@example.test', metadata: {} },
    profile: { firebase_uid: 'uid-one', email: 'uid-one@example.test' },
    logout: vi.fn(),
    patchProfile: vi.fn(),
    completeSignUp: vi.fn(),
    prepareGoogleSignUp: vi.fn(),
  }),
}));
vi.mock('../src/utils/auth', () => ({
  authFetch: vi.fn(async () => { throw new Error('Unexpected API call'); }),
  getAuthHeaders: vi.fn(async () => ({})),
  signOutOtherSessions: vi.fn(async () => { throw new Error('Unexpected API call'); }),
}));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  browserLocalPersistence: { type: 'LOCAL' },
  browserSessionPersistence: { type: 'SESSION' },
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  updateProfile: vi.fn(),
}));

import { sendPasswordResetEmail as firebaseSendReset, signInWithEmailAndPassword } from 'firebase/auth';
import { sendPasswordResetEmail as settingsSendReset, updatePassword } from '../src/firebase';
import Login from '../src/pages/auth/Login.jsx';
import Signup from '../src/pages/auth/Signup.jsx';
import Settings from '../src/pages/Settings.jsx';

const firebaseError = (code) => Object.assign(new Error(`Firebase: raw text (${code}).`), { code });
const page = (element) => render(<MemoryRouter>{element}</MemoryRouter>);
const click = async (name) => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
};

function expectInvalid(field, message) {
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(field).toHaveAccessibleDescription(message);
}

function expectValid(field) {
  expect(field).not.toHaveAttribute('aria-invalid');
  expect(field).not.toHaveAttribute('aria-describedby');
}

beforeEach(() => {
  vi.mocked(signInWithEmailAndPassword).mockReset();
  vi.mocked(firebaseSendReset).mockReset();
  vi.mocked(settingsSendReset).mockReset();
  vi.mocked(updatePassword).mockReset();
  fakes.auth.currentUser = { uid: 'uid-one' };
});

describe('IDENTITY-017: Login', () => {
  const email = () => screen.getByLabelText(/^email$/i);
  const password = () => screen.getByLabelText(/^password$/i);

  async function signIn(code) {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(firebaseError(code));
    fireEvent.change(email(), { target: { value: 'person@example.test' } });
    fireEvent.change(password(), { target: { value: 'synthetic-password' } });
    await click(/^sign in$/i);
  }

  it('sets autocomplete to email and current-password', () => {
    page(<Login />);
    expect(email()).toHaveAttribute('autocomplete', 'email');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
  });

  it('announces a credential error, marks both fields and focuses email', async () => {
    page(<Login />);
    password().focus();

    await signIn('auth/invalid-credential');

    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expectInvalid(email(), 'Incorrect email or password.');
    expectInvalid(password(), 'Incorrect email or password.');
    expect(email()).toHaveFocus();
  });

  it('marks only email for an invalid-email error', async () => {
    page(<Login />);

    await signIn('auth/invalid-email');

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expectInvalid(email(), 'Enter a valid email address.');
    expectValid(password());
    expect(email()).toHaveFocus();
  });

  it('clears the old markings when a later error is about other fields', async () => {
    page(<Login />);

    await signIn('auth/invalid-credential');
    await signIn('auth/invalid-email');
    expectInvalid(email(), 'Enter a valid email address.');
    expectValid(password());

    // An error that is about no field leaves no field marked.
    await signIn('auth/too-many-requests');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expectValid(email());
    expectValid(password());
  });

  it('marks and focuses email when Forgot password is used without an email', async () => {
    page(<Login />);
    password().focus();

    await click('Forgot password?');

    const message = 'Enter your email address above, then select Forgot password? again.';
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expectInvalid(email(), message);
    expectValid(password());
    expect(email()).toHaveFocus();
    expect(firebaseSendReset).not.toHaveBeenCalled();
  });
});

describe('IDENTITY-017: Signup', () => {
  const terms = () => screen.getByLabelText(/i agree to the/i);
  const TERMS_REQUIRED = 'Please accept the Terms and Privacy Policy to continue.';

  it('sets autocomplete to name, email and new-password', () => {
    page(<Signup />);
    expect(screen.getByLabelText(/full name/i)).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('autocomplete', 'new-password');
  });

  it('describes the password field with the length hint', () => {
    page(<Signup />);
    const field = screen.getByLabelText(/^password$/i);
    expect(field).toHaveAccessibleDescription('Use at least 8 characters.');
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it.each([
    ['the email form', /^create account$/i],
    ['Google sign-up', /continue with google/i],
  ])('announces the terms error from %s, marks and focuses the terms box', async (_label, button) => {
    page(<Signup />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Synthetic Person' } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'person@example.test' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'synthetic-password' } });

    await click(button);

    expect(screen.getByRole('alert')).toHaveTextContent(TERMS_REQUIRED);
    expectInvalid(terms(), TERMS_REQUIRED);
    expect(terms()).toHaveFocus();
    // The other fields are not part of this error.
    expectValid(screen.getByLabelText(/^email$/i));
    expect(screen.getByLabelText(/^password$/i)).not.toHaveAttribute('aria-invalid');
  });
});

describe('IDENTITY-017: Settings', () => {
  const newPassword = () => screen.getByLabelText('New password');
  const confirmPassword = () => screen.getByLabelText('Confirm password');

  async function save(password, confirm = password) {
    fireEvent.change(newPassword(), { target: { value: password } });
    fireEvent.change(confirmPassword(), { target: { value: confirm } });
    await click('Save changes');
  }

  it('names the preference switches', () => {
    page(<Settings />);
    expect(screen.getByRole('checkbox', { name: 'Weekly insights' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Job alerts' })).toBeInTheDocument();
  });

  it('sets autocomplete to new-password on both password fields', () => {
    page(<Settings />);
    expect(newPassword()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmPassword()).toHaveAttribute('autocomplete', 'new-password');
  });

  it('marks and focuses New password when it is too short', async () => {
    page(<Settings />);

    await save('short');

    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent(/at least 8 characters/i);
    expectInvalid(newPassword(), message.textContent);
    expectValid(confirmPassword());
    expect(newPassword()).toHaveFocus();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('marks and focuses only Confirm password when the passwords differ', async () => {
    page(<Settings />);

    await save('synthetic-password-2', 'synthetic-password-3');

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    expectInvalid(confirmPassword(), 'Passwords do not match.');
    expectValid(newPassword());
    expect(confirmPassword()).toHaveFocus();
  });

  it('uses role="status" for success and clears the field markings', async () => {
    page(<Settings />);
    await save('short');

    // Nothing changed, so this saves no preferences and calls no API.
    await save('', '');

    expect(screen.getByRole('status')).toHaveTextContent('Preferences saved.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectValid(newPassword());
    expectValid(confirmPassword());
  });

  it('announces a reset-email failure as an alert that marks no field', async () => {
    vi.mocked(settingsSendReset).mockRejectedValueOnce(new Error('Failed to send reset email.'));
    page(<Settings />);

    await click('Reset password');

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to send reset email.');
    expectValid(newPassword());
    expectValid(confirmPassword());
  });

  it('announces a sent reset email with role="status"', async () => {
    vi.mocked(settingsSendReset).mockResolvedValueOnce();
    page(<Settings />);

    await click('Reset password');

    expect(screen.getByRole('status')).toHaveTextContent('Password reset email sent.');
  });
});
