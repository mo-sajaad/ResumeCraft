import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import CareerLabLayout from '../src/pages/dashboard/career-lab/CareerLabLayout.jsx';
import CareerLabOverview from '../src/pages/dashboard/career-lab/CareerLabOverview.jsx';
import CareerLabToolPage from '../src/pages/dashboard/career-lab/CareerLabToolPage.jsx';
import { CAREER_LAB_TOOLS, TOOL_MAP } from '../src/pages/dashboard/career-lab/careerLabTools.js';

const authState = vi.hoisted(() => ({ profile: null }));
vi.mock('../src/context/useAuth', () => ({ useAuth: () => authState }));

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

// CAREER-018: an unknown plan is not the Free plan.
describe('plan shown for a Pro tool', () => {
  function renderTool(profile) {
    authState.profile = profile;
    render(
      <MemoryRouter initialEntries={['/dashboard/career-lab/tools/salary-estimate']}>
        <Routes>
          <Route path="/dashboard/career-lab" element={<CareerLabLayout />}>
            <Route path="tools/:toolId" element={<CareerLabToolPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  it('without a profile shows neither an upgrade card nor locks', () => {
    renderTool(null);

    expect(screen.getByText('Loading your plan...')).toBeInTheDocument();
    expect(screen.queryByText(/plan required/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view pro plan/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /plan required/i })).toEqual([]);
  });

  it('asks a loaded Free profile, with no plan_code, to upgrade', () => {
    renderTool({ plan_code: null });

    expect(screen.getByRole('heading', { name: 'Pro Plan Required' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Salary Estimate, Pro plan required' })).toBeInTheDocument();
  });

  it('opens the tool for a Pro profile', () => {
    renderTool({ plan_code: 'pro' });

    expect(screen.queryByText(/plan required/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Loading your plan...')).not.toBeInTheDocument();
  });
});

describe('CAREER-018: plan locks follow the loaded profile', () => {
  function renderLab(path, profile) {
    authState.profile = profile;
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard/career-lab" element={<CareerLabLayout />}>
            <Route index element={<CareerLabOverview />} />
            <Route path="tools/:toolId" element={<CareerLabToolPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  const nav = () => screen.getByRole('navigation', { name: 'Career Lab Tool Navigation' });
  const toolLinks = () => within(nav()).getAllByRole('link');
  const lockedLinks = () => within(nav()).queryAllByRole('link', { name: /plan required/i });
  const toolsAbove = (plans) => CAREER_LAB_TOOLS.filter(({ minimumPlan }) => !plans.includes(minimumPlan));

  afterEach(() => { authState.profile = null; });

  it('locks nothing in the navigation while the profile is not loaded', () => {
    renderLab('/dashboard/career-lab', null);

    expect(toolLinks()).toHaveLength(CAREER_LAB_TOOLS.length);
    expect(lockedLinks()).toEqual([]);
    expect(nav()).not.toHaveTextContent(/\b(Premium|Pro)\b/);
  });

  it.each([
    ['null', { plan_code: null }, ['free']],
    ['"free"', { plan_code: 'free' }, ['free']],
    ['"premium"', { plan_code: 'premium' }, ['free', 'premium']],
    ['"pro"', { plan_code: 'pro' }, ['free', 'premium', 'pro']],
  ])('locks exactly the tools above a loaded plan_code of %s', (_label, profile, allowed) => {
    renderLab('/dashboard/career-lab', profile);

    const expected = toolsAbove(allowed).map(({ title, minimumPlan }) => (
      `${title}, ${minimumPlan.charAt(0).toUpperCase()}${minimumPlan.slice(1)} plan required`
    ));
    expect(lockedLinks().map((link) => link.getAttribute('aria-label')).sort()).toEqual(expected.sort());
  });

  it.each([['job-parser'], ['role-fit'], ['salary-estimate']])(
    'shows Loading your plan... on the %s page without a profile',
    (toolId) => {
      renderLab(`/dashboard/career-lab/tools/${toolId}`, null);

      const card = screen.getByRole('status');
      expect(card).toHaveTextContent(TOOL_MAP[toolId].title);
      expect(card).toHaveTextContent('Loading your plan...');
      expect(screen.queryByText(/plan required/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Tool Workspace')).not.toBeInTheDocument();
    }
  );

  it('asks a Free profile to upgrade for a Premium tool', () => {
    renderLab('/dashboard/career-lab/tools/role-fit', { plan_code: 'free' });

    expect(screen.getByRole('heading', { name: 'Premium Plan Required' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Premium plan' })).toHaveAttribute('href', '/dashboard/payment');
    expect(screen.queryByText('Tool Workspace')).not.toBeInTheDocument();
  });

  it('opens a Free tool for a Free profile', () => {
    renderLab('/dashboard/career-lab/tools/job-parser', { plan_code: null });

    expect(screen.getByText('Tool Workspace')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TOOL_MAP['job-parser'].title })).toBeInTheDocument();
  });

  it('opens a Premium tool for a Premium profile but still locks a Pro tool', () => {
    const { unmount } = renderLab('/dashboard/career-lab/tools/role-fit', { plan_code: 'premium' });
    expect(screen.getByText('Tool Workspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TOOL_MAP['role-fit'].buttonLabel })).toBeInTheDocument();
    unmount();

    renderLab('/dashboard/career-lab/tools/salary-estimate', { plan_code: 'premium' });
    expect(screen.getByRole('heading', { name: 'Pro Plan Required' })).toBeInTheDocument();
  });

  it('opens a Pro tool with its inputs for a Pro profile', () => {
    renderLab('/dashboard/career-lab/tools/salary-estimate', { plan_code: 'PRO' });

    expect(screen.getByText('Tool Workspace')).toBeInTheDocument();
    for (const field of TOOL_MAP['salary-estimate'].fields) {
      expect(screen.getByLabelText(field.label)).toBeInTheDocument();
    }
  });

  it('replaces the loading card with the tool once the profile arrives', () => {
    const { rerender } = renderLab('/dashboard/career-lab/tools/salary-estimate', null);
    expect(screen.getByText('Loading your plan...')).toBeInTheDocument();

    authState.profile = { plan_code: 'pro' };
    rerender(
      <MemoryRouter initialEntries={['/dashboard/career-lab/tools/salary-estimate']}>
        <Routes>
          <Route path="/dashboard/career-lab" element={<CareerLabLayout />}>
            <Route path="tools/:toolId" element={<CareerLabToolPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Loading your plan...')).not.toBeInTheDocument();
    expect(screen.getByText('Tool Workspace')).toBeInTheDocument();
  });
});
