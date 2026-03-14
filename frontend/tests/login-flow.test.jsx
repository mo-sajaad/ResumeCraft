import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: null, hasFirebaseConfig: false }));
vi.mock('../src/utils/auth', () => ({ exchangeFirebaseTokenForJwt: vi.fn() }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  browserLocalPersistence: {},
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
}));

import Login from '../src/pages/auth/Login.jsx';

describe('login flow', () => {
  it('shows firebase configuration error when unavailable', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/firebase is not configured/i)).toBeInTheDocument();
  });
});
