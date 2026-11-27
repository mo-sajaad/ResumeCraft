// ADMIN-010 and ADMIN-013: admin dashboard panels, flag toggles and usage totals.
// All data below is synthetic.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

const authState = vi.hoisted(() => ({ value: null }));
const authFetch = vi.hoisted(() => vi.fn());

vi.mock('../src/context/useAuth', () => ({ useAuth: () => authState.value }));
vi.mock('../src/utils/auth', () => ({ authFetch }));

import AdminDashboard from '../src/pages/AdminDashboard.jsx';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const FLAGS = [
  { key: 'admin_dashboard', description: 'Admin', enabled: true, rollout_percent: 100 },
  { key: 'usage_analytics', description: 'Usage', enabled: false, rollout_percent: 10 },
];
const USAGE = {
  events: [
    { route: '/api/resumes', event_type: 'api_request', count: 90 },
    { route: '/api/users/:uid', event_type: 'api_request', count: 40 },
  ],
  truncated: true,
  totalEvents: 200,
};

function answer(overrides = {}) {
  authFetch.mockImplementation(async (url, init = {}) => {
    const path = url.split('?')[0];
    if (overrides[path]) return overrides[path](init);
    if (path === '/api/admin/feature-flags') return json({ flags: FLAGS });
    if (path === '/api/admin/analytics/usage') return json(USAGE);
    if (path === '/api/admin/audit-logs') return json({ logs: [] });
    throw new Error(`unexpected ${url}`);
  });
}

beforeEach(() => {
  authFetch.mockReset();
  authState.value = { profile: { is_admin: true }, sessionStatus: 'ready', retrySession: vi.fn() };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('ADMIN-013: a failed panel does not hide the others and can be retried', async () => {
  answer({ '/api/admin/analytics/usage': () => json({ message: 'Internal server error' }, 500) });
  render(<AdminDashboard />);

  expect(await screen.findByRole('alert')).toHaveTextContent(/internal server error/i);
  expect(await screen.findByText('admin_dashboard')).toBeInTheDocument();
  expect(screen.getByText('No audit entries yet.')).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);

  answer();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText(/200 events in total/)).toBeInTheDocument();
});

it('ADMIN-010: usage is shown in server order with the total and a truncation note', async () => {
  answer();
  render(<AdminDashboard />);

  expect(await screen.findByText(/200 events in total\. Showing the 2 busiest routes\./)).toBeInTheDocument();
  const items = screen.getAllByRole('listitem');
  expect(items[0]).toHaveTextContent('/api/resumes · api_request: 90');
  expect(items[1]).toHaveTextContent('/api/users/:uid · api_request: 40');
});

it('ADMIN-013: a toggle is named, confirmed, sends only enabled and updates its row', async () => {
  let release;
  answer({
    '/api/admin/feature-flags/usage_analytics': () => new Promise((resolve) => {
      release = () => resolve(json({ flag: { ...FLAGS[1], enabled: true } }));
    }),
  });
  render(<AdminDashboard />);

  const button = await screen.findByRole('button', { name: 'Turn on usage_analytics' });
  fireEvent.click(button);

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('usage_analytics'));
  const patch = authFetch.mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(JSON.parse(patch[1].body)).toEqual({ enabled: true });
  expect(screen.getByRole('button', { name: 'Turn off admin_dashboard' })).toBeDisabled();

  release();
  expect(await screen.findByText('usage_analytics is now on.')).toBeInTheDocument();
  const row = screen.getByText('usage_analytics').closest('tr');
  expect(within(row).getByText('On')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Turn off admin_dashboard' })).toBeEnabled();
});

it('ADMIN-013: a cancelled confirmation sends nothing', async () => {
  window.confirm.mockReturnValue(false);
  answer();
  render(<AdminDashboard />);

  fireEvent.click(await screen.findByRole('button', { name: 'Turn off admin_dashboard' }));

  expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/Feature flags stay available/));
  expect(authFetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
});

it('ADMIN-013: a failed profile load offers a retry instead of saying no permission', async () => {
  authState.value = { profile: null, sessionStatus: 'error', retrySession: vi.fn() };
  render(<AdminDashboard />);

  expect(screen.getByRole('alert')).toHaveTextContent(/could not check your access/i);
  expect(screen.queryByText(/do not have permission/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(authState.value.retrySession).toHaveBeenCalled();
  expect(authFetch).not.toHaveBeenCalled();
});
