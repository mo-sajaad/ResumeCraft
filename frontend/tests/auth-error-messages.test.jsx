// IDENTITY-020: Firebase error codes are mapped to neutral text. Wrong password
// and unknown user share one message, so the form does not reveal whether an
// account exists. Firebase is mocked; all data is synthetic.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: { name: 'synthetic-auth' }, hasFirebaseConfig: true }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  browserLocalPersistence: { type: 'LOCAL' },
  browserSessionPersistence: { type: 'SESSION' },
  sendPasswordResetEmail: vi.fn(),
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
}));

import { signInWithEmailAndPassword } from 'firebase/auth';
import Login from '../src/pages/auth/Login.jsx';
import { authErrorMessage } from '../src/utils/validators';

const firebaseError = (code) => Object.assign(new Error(`Firebase: raw text (${code}).`), { code });

describe('authErrorMessage', () => {
  it('gives wrong password, unknown user and invalid credential one message', () => {
    const messages = ['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential']
      .map((code) => authErrorMessage(firebaseError(code), 'fallback'));

    expect(new Set(messages)).toEqual(new Set(['Incorrect email or password.']));
  });

  it('uses the fallback for an unknown code or a missing error', () => {
    expect(authErrorMessage(firebaseError('auth/internal-error'), 'fallback')).toBe('fallback');
    expect(authErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});

describe('Login shows the mapped text, not the raw Firebase message', () => {
  it.each(['auth/wrong-password', 'auth/user-not-found'])('for %s', async (code) => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(firebaseError(code));
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'person@example.test' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'synthetic-password' } });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^sign in$/i })); });

    expect(screen.getByText('Incorrect email or password.')).toBeInTheDocument();
    expect(screen.queryByText(/raw text/)).not.toBeInTheDocument();
  });
});
