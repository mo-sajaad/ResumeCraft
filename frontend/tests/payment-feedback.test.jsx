// SHELL-015: the Payment feedback card is announced. Errors use role="alert"
// with the .error-message style; success messages use role="status". Auth and
// billing calls are stand-ins; no request leaves the test.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const refreshProfile = vi.hoisted(() => ({ current: null }));

vi.mock('../src/context/useAuth', () => ({
  useAuth: () => ({ profile: { plan_code: 'free' }, refreshProfile: refreshProfile.current }),
}));
vi.mock('../src/utils/auth', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({}),
  authFetch: vi.fn(),
}));

import { authFetch } from '../src/utils/auth';
import Payment from '../src/pages/Payment.jsx';

function renderAt(search) {
  window.history.replaceState({}, '', `/dashboard/payment${search}`);
  return render(<Payment />);
}

beforeEach(() => {
  refreshProfile.current = vi.fn().mockResolvedValue(undefined);
  vi.mocked(authFetch).mockReset();
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('Payment feedback announcements', () => {
  it('announces a successful checkout with role="status"', async () => {
    renderAt('?success=1');

    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Your subscription is active.'));
    expect(status).not.toHaveClass('error-message');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces a canceled checkout with role="alert" and the error style', async () => {
    renderAt('?canceled=1');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Checkout was canceled.');
    expect(alert).toHaveClass('content-card', 'error-message');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('switches from status to alert when the plan refresh fails', async () => {
    refreshProfile.current = vi.fn().mockRejectedValue(new Error('offline'));
    renderAt('?success=1');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not refresh your plan/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces a checkout request failure with role="alert"', async () => {
    vi.mocked(authFetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Checkout is unavailable.' }),
    });
    renderAt('');

    fireEvent.click(screen.getByRole('button', { name: 'Choose Premium' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Checkout is unavailable.');
    expect(alert).toHaveClass('error-message');
  });

  it('shows no feedback card without a checkout result', () => {
    renderAt('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
