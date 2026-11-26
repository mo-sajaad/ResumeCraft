// SHELL-012: the dashboard shell needs a signed-in user with a loaded profile,
// and shows only what that profile says. Uses the routes of src/router.jsx in
// a memory router; the auth state is a stand-in and all data is synthetic.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => (await import('./support/fakeFirebase.js')).appModule());
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

const authState = vi.hoisted(() => ({ current: {} }));
vi.mock('../src/context/useAuth', () => ({ useAuth: () => authState.current }));

import DashboardLayout from '../src/layouts/DashboardLayout.jsx';
import { router as appRouter } from '../src/router.jsx';

const USER = { uid: 'uid-shell', email: 'shell.user@example.test', displayName: 'Shell User', emailVerified: true };

function authAs(overrides) {
  authState.current = {
    user: null,
    profile: null,
    sessionStatus: 'idle',
    loading: false,
    authError: '',
    needsEmailVerification: false,
    verificationEmail: null,
    logout: vi.fn(async () => {}),
    retrySession: vi.fn(async () => {}),
    refreshProfile: vi.fn(async () => null),
    completeSignUp: vi.fn(async () => {}),
    sendVerificationEmail: vi.fn(async () => {}),
    confirmEmailVerified: vi.fn(async () => false),
    ...overrides,
  };
}

const signedIn = (sessionStatus, profile = null) => authAs({ user: USER, sessionStatus, profile });

const shell = () => document.querySelector('.dashboard-shell');

beforeEach(() => {
  localStorage.clear();
  // No page here may reach the network; a request is a test failure.
  vi.stubGlobal('fetch', vi.fn(async (url) => { throw new Error(`Unexpected request: ${url}`); }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => appRouter.dispose());

describe('SHELL-012: dashboard route order', () => {
  let observer;
  let shellEverShown;

  function scan(records) {
    for (const { addedNodes } of records) {
      for (const node of addedNodes) {
        if (node.nodeType === 1 && (node.matches('.dashboard-shell') || node.querySelector('.dashboard-shell'))) {
          shellEverShown = true;
        }
      }
    }
  }

  // Also catches a shell that is rendered and removed again before an assertion.
  function watchForShell() {
    shellEverShown = false;
    observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function everShown() {
    scan(observer.takeRecords());
    return shellEverShown;
  }

  beforeEach(watchForShell);
  afterEach(() => observer.disconnect());

  async function visit(path) {
    const memoryRouter = createMemoryRouter(appRouter.routes, { initialEntries: [path] });
    await act(async () => { render(<RouterProvider router={memoryRouter} />); });
    return memoryRouter;
  }

  it('uses the guard as the parent of the dashboard layout', () => {
    const dashboard = appRouter.routes.find(({ path }) => path === 'dashboard');

    expect(dashboard.element.type.name).toBe('ProtectedRoute');
    expect(dashboard.children).toHaveLength(1);
    expect(dashboard.children[0].element.type).toBe(DashboardLayout);
  });

  it.each([
    ['/dashboard'],
    ['/dashboard/settings'],
    ['/dashboard/career-lab/tools/salary-estimate'],
    ['/dashboard/admin'],
  ])('never renders the shell for a signed-out visit to %s', async (path) => {
    authAs({ user: null });

    const memoryRouter = await visit(path);

    await waitFor(() => expect(memoryRouter.state.location.pathname).toBe('/auth/login'));
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(shell()).toBeNull();
    expect(everShown()).toBe(false);
  });

  it('shows only the session check while Firebase is loading', async () => {
    authAs({ loading: true });

    await visit('/dashboard/career-lab');

    expect(screen.getByRole('status')).toHaveTextContent('Checking your session...');
    expect(shell()).toBeNull();
    expect(everShown()).toBe(false);
  });

  it('shows only the account loader while the session is loading', async () => {
    signedIn('loading');

    await visit('/dashboard/settings');

    expect(screen.getByRole('status')).toHaveTextContent('Loading your account...');
    expect(shell()).toBeNull();
    expect(everShown()).toBe(false);
  });

  it('shows only the could-not-load panel when the session failed', async () => {
    signedIn('error');

    await visit('/dashboard');

    expect(screen.getByRole('alert')).toHaveTextContent(/could not load your account/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(shell()).toBeNull();
    expect(everShown()).toBe(false);
  });

  it('sends a user waiting for email verification to the sign-in pages without the shell', async () => {
    authAs({ user: { ...USER, emailVerified: false }, needsEmailVerification: true });

    const memoryRouter = await visit('/dashboard');

    await waitFor(() => expect(memoryRouter.state.location.pathname).toBe('/auth/login'));
    expect(everShown()).toBe(false);
  });

  it('renders the shell once the session is ready', async () => {
    signedIn('ready', { firebase_uid: USER.uid, plan_code: 'pro' });

    await visit('/dashboard/career-lab/tools/salary-estimate');

    expect(shell()).not.toBeNull();
    expect(await screen.findByRole('heading', { name: 'Salary Estimate' })).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('SHELL-012: DashboardLayout plan label and links', () => {
  function renderShell() {
    return render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<p>Synthetic page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  const userChip = () => screen.getByRole('button', { name: /shell user/i });
  const sidebar = () => document.querySelector('.sidebar-nav');

  it('shows no plan label without a profile', () => {
    authAs({ user: USER, sessionStatus: 'ready', profile: null });

    renderShell();

    expect(userChip()).toHaveTextContent('Shell User');
    expect(userChip()).not.toHaveTextContent(/plan/i);
    expect(document.querySelector('.user-plan')).toBeNull();
  });

  it.each([
    ['null', null],
    ['missing', undefined],
    ['"free"', 'free'],
  ])('shows Free Plan for a loaded profile whose plan_code is %s', (_label, planCode) => {
    signedIn('ready', { firebase_uid: USER.uid, plan_code: planCode });

    renderShell();

    expect(document.querySelector('.user-plan')).toHaveTextContent(/^Free Plan$/);
  });

  it.each([
    ['pro', 'Pro Plan'],
    ['premium', 'Premium Plan'],
    ['PREMIUM', 'Premium Plan'],
  ])('shows the real plan for plan_code %s', (planCode, label) => {
    signedIn('ready', { firebase_uid: USER.uid, plan_code: planCode });

    renderShell();

    expect(document.querySelector('.user-plan')).toHaveTextContent(new RegExp(`^${label}$`));
    expect(userChip()).not.toHaveTextContent('Free Plan');
  });

  it.each([
    ['without a profile', null],
    ['for a profile without is_admin', { firebase_uid: USER.uid }],
    ['for a profile with is_admin false', { firebase_uid: USER.uid, is_admin: false }],
  ])('hides the Admin link %s', (_label, profile) => {
    signedIn('ready', profile);

    renderShell();

    expect(within(sidebar()).getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(within(sidebar()).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows the Admin link for a profile with is_admin', () => {
    signedIn('ready', { firebase_uid: USER.uid, is_admin: true });

    renderShell();

    expect(within(sidebar()).getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/dashboard/admin');
  });
});
