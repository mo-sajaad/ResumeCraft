import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CareerLabOverview from '../src/pages/dashboard/career-lab/CareerLabOverview.jsx';

describe('career tool workflows', () => {
  it('renders recommended workflow and ATS starting CTA', () => {
    render(
      <MemoryRouter>
        <CareerLabOverview />
      </MemoryRouter>
    );

    expect(screen.getByText(/recommended flow/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start with ats analysis/i })).toHaveAttribute(
      'href',
      '/dashboard/career-lab/tools/ats-analysis'
    );
  });
});
