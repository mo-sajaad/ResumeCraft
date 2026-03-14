import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../src/context/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../src/firebase', () => ({ auth: {}, hasFirebaseConfig: true }));
vi.mock('../src/utils/auth', () => ({ exchangeFirebaseTokenForJwt: vi.fn() }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  browserLocalPersistence: {},
  createUserWithEmailAndPassword: vi.fn(),
  setPersistence: vi.fn(),
  signInWithPopup: vi.fn(),
  updateProfile: vi.fn(),
}));

import Signup from '../src/pages/auth/Signup.jsx';

describe('onboarding flow', () => {
  it('requires accepting terms before signup submit', async () => {
    render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/please accept the terms/i)).toBeInTheDocument();
  });
});
