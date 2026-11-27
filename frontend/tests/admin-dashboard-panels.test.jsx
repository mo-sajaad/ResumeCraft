// ADMIN-013 (and the ADMIN-005 message): each admin panel loads, fails and
// retries on its own; flag toggles show saving state, failures and the
// admin_dashboard warning. authFetch is mocked; all data is synthetic.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

const authState = vi.hoisted(() => ({ value: null }));
const authFetch = vi.hoisted(() => vi.fn());

vi.mock('../src/context/useAuth', () => ({ useAuth: () => authState.value }));
vi.mock('../src/utils/auth', () => ({ authFetch }));

import AdminDashboard from '../src/pages/AdminDashboard.jsx';

const FLAGS_URL = '/api/admin/feature-flags';
const USAGE_URL = '/api/admin/analytics/usage';
const AUDIT_URL = '/api/admin/audit-logs';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const FLAGS = [
  { key: 'admin_dashboard', description: 'Admin', enabled: true, rollout_percent: 100 },
  { key: 'usage_analytics', description: 'Usage', enabled: false, rollout_percent: 10 },
];
const USAGE = { events: [{ route: '/api/resumes', event_type: 'api_request', count: 7 }], truncated: false, totalEvents: 7 };
const LOGS = [{ id: 1, created_at: '2026-01-01T00:00:00Z', actor_firebase_uid: 'synthetic-admin', action: 'feature_flag.update', resource_type: 'feature_flag', resource_id: 'demo' }];

let handlers;

function serve() {
  authFetch.mockImplementation(async (url, init = {}) => {
    const path = url.split('?')[0];
    const method = init.method || 'GET';
    const handler = handlers[`${method} ${path}`];
    if (!handler) throw new Error(`unexpected ${method} ${url}`);
    return handler(init);
  });
}

const calls = (method, path) => authFetch.mock.calls
  .filter(([url, init = {}]) => url.split('?')[0] === path && (init.method || 'GET') === method);

const section = (name) => screen.getByRole('heading', { level: 2, name }).closest('section');

beforeEach(() => {
  authFetch.mockReset();
  authState.value = { profile: { is_admin: true }, sessionStatus: 'ready', retrySession: vi.fn() };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  handlers = {
    [`GET ${FLAGS_URL}`]: () => json({ flags: FLAGS }),
    [`GET ${USAGE_URL}`]: () => json(USAGE),
    [`GET ${AUDIT_URL}`]: () => json({ logs: LOGS }),
  };
  serve();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ADMIN-013: independent panels', () => {
  it('a failed flags panel leaves usage and audit logs visible', async () => {
    handlers[`GET ${FLAGS_URL}`] = () => json({ message: 'Internal server error' }, 500);
    render(<AdminDashboard />);

    expect(await screen.findByText('Could not load feature flags')).toBeInTheDocument();
    expect(await screen.findByText(/7 events in total/)).toBeInTheDocument();
    expect(screen.getByText('feature_flag.update')).toBeInTheDocument();
  });

  it('shows the server reason, such as a disabled admin_dashboard', async () => {
    handlers[`GET ${USAGE_URL}`] = () => json({ error: 'Feature is not enabled for your account.' }, 403);
    handlers[`GET ${AUDIT_URL}`] = () => json({ error: 'Feature is not enabled for your account.' }, 403);
    render(<AdminDashboard />);

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    for (const name of [/Usage Analytics/, 'Recent Audit Logs']) {
      expect(within(section(name)).getByRole('alert')).toHaveTextContent('Feature is not enabled for your account.');
    }
    expect(await screen.findByText('admin_dashboard')).toBeInTheDocument();
  });

  it('falls back to the HTTP status when the error body is not JSON', async () => {
    handlers[`GET ${AUDIT_URL}`] = () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
    render(<AdminDashboard />);

    expect(await screen.findByText(/Request failed \(HTTP 502\)/)).toBeInTheDocument();
  });

  it('retrying one failed panel reloads only that panel and leaves the other failed', async () => {
    handlers[`GET ${USAGE_URL}`] = () => json({ message: 'usage down' }, 500);
    handlers[`GET ${AUDIT_URL}`] = () => json({ message: 'audit down' }, 500);
    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));

    handlers[`GET ${USAGE_URL}`] = () => json(USAGE);
    const before = { flags: calls('GET', FLAGS_URL).length, audit: calls('GET', AUDIT_URL).length };
    fireEvent.click(within(section(/Usage Analytics/)).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/7 events in total/)).toBeInTheDocument();
    expect(within(section('Recent Audit Logs')).getByRole('alert')).toHaveTextContent('audit down');
    expect(calls('GET', USAGE_URL)).toHaveLength(2);
    expect(calls('GET', FLAGS_URL)).toHaveLength(before.flags);
    expect(calls('GET', AUDIT_URL)).toHaveLength(before.audit);
  });

  it('a retry that fails again keeps the panel in its error state', async () => {
    handlers[`GET ${AUDIT_URL}`] = () => json({ message: 'audit down' }, 500);
    render(<AdminDashboard />);
    await screen.findByText('audit down');

    handlers[`GET ${AUDIT_URL}`] = () => json({ message: 'still down' }, 500);
    fireEvent.click(within(section('Recent Audit Logs')).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('still down')).toBeInTheDocument();
    expect(calls('GET', AUDIT_URL)).toHaveLength(2);
  });

  it('a non-admin sees the permission message and nothing is requested', () => {
    authState.value = { profile: { is_admin: false }, sessionStatus: 'ready', retrySession: vi.fn() };
    render(<AdminDashboard />);

    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
    expect(authFetch).not.toHaveBeenCalled();
  });
});

describe('ADMIN-013: flag toggles', () => {
  it('shows Saving on the toggled flag and disables every toggle until the save ends', async () => {
    let release;
    handlers[`PATCH ${FLAGS_URL}/usage_analytics`] = () => new Promise((resolve) => {
      release = () => resolve(json({ flag: { ...FLAGS[1], enabled: true } }));
    });
    render(<AdminDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Turn on usage_analytics' }));

    const saving = screen.getByRole('button', { name: 'Turn on usage_analytics' });
    expect(saving).toHaveTextContent('Saving…');
    expect(saving).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Turn off admin_dashboard' })).toBeDisabled();
    // A second click while saving sends nothing more.
    fireEvent.click(saving);
    expect(calls('PATCH', `${FLAGS_URL}/usage_analytics`)).toHaveLength(1);

    release();
    expect(await screen.findByRole('button', { name: 'Turn off usage_analytics' })).toBeEnabled();
  });

  it('updates the row in place without reloading the flags, then reloads the audit log', async () => {
    handlers[`PATCH ${FLAGS_URL}/usage_analytics`] = () => json({ flag: { ...FLAGS[1], enabled: true } });
    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on usage_analytics' }));

    expect(await screen.findByRole('status')).toHaveTextContent('usage_analytics is now on.');
    const row = screen.getByText('usage_analytics').closest('tr');
    expect(within(row).getByText('On')).toBeInTheDocument();
    expect(within(row).getByText('10')).toBeInTheDocument();
    expect(calls('GET', FLAGS_URL)).toHaveLength(1);
    await waitFor(() => expect(calls('GET', AUDIT_URL)).toHaveLength(2));
  });

  it('reloads the flags when the response has no flag', async () => {
    handlers[`PATCH ${FLAGS_URL}/usage_analytics`] = () => json({});
    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on usage_analytics' }));

    expect(await screen.findByText('usage_analytics is now on.')).toBeInTheDocument();
    expect(calls('GET', FLAGS_URL)).toHaveLength(2);
  });

  it('reports a failed save, keeps the row unchanged and re-enables the toggles', async () => {
    handlers[`PATCH ${FLAGS_URL}/usage_analytics`] = () => json({ error: 'Flag key must be lower case.' }, 400);
    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on usage_analytics' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Flag key must be lower case.');
    const row = screen.getByText('usage_analytics').closest('tr');
    expect(within(row).getByText('Off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on usage_analytics' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Turn off admin_dashboard' })).toBeEnabled();
    expect(calls('GET', AUDIT_URL)).toHaveLength(1);
  });

  it('reports a network failure with a fallback message', async () => {
    handlers[`PATCH ${FLAGS_URL}/usage_analytics`] = () => json(null, 500);
    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on usage_analytics' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update usage_analytics (HTTP 500).');
  });

  it('cancelling the confirmation sends nothing and changes nothing', async () => {
    window.confirm.mockReturnValue(false);
    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on usage_analytics' }));

    expect(window.confirm).toHaveBeenCalledWith('Turn on usage_analytics?');
    expect(authFetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    expect(screen.getByRole('button', { name: 'Turn on usage_analytics' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('turning admin_dashboard off warns what stops loading and that flags stay available', async () => {
    handlers[`PATCH ${FLAGS_URL}/admin_dashboard`] = () => json({ flag: { ...FLAGS[0], enabled: false } });
    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off admin_dashboard' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Turn off admin_dashboard?\n\nUsage analytics and audit logs on this page stop loading until it is turned back on. Feature flags stay available.'
    );
    expect(await screen.findByText('admin_dashboard is now off.')).toBeInTheDocument();
    expect(JSON.parse(calls('PATCH', `${FLAGS_URL}/admin_dashboard`)[0][1].body)).toEqual({ enabled: false });
  });

  it('turning admin_dashboard on shows no warning', async () => {
    handlers[`GET ${FLAGS_URL}`] = () => json({ flags: [{ ...FLAGS[0], enabled: false }] });
    window.confirm.mockReturnValue(false);
    render(<AdminDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on admin_dashboard' }));

    expect(window.confirm).toHaveBeenCalledWith('Turn on admin_dashboard?');
  });
});
