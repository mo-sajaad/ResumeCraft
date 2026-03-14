import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../src/context/useAuth', () => ({
  useAuth: () => ({
    profile: { plan_code: 'pro' },
    refreshProfile: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('../src/utils/auth', () => ({ getAuthHeaders: vi.fn().mockResolvedValue({}) }));

import Payment from '../src/pages/Payment.jsx';

describe('billing UI', () => {
  it('shows manage billing CTA for paid plans', () => {
    render(<Payment />);

    expect(screen.getByText(/already subscribed\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage billing/i })).toBeInTheDocument();
  });
});
