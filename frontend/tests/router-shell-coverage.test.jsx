// SHELL-003, SHELL-007, SHELL-019: more cover for the route shell. Uses the
// routes of src/router.jsx in a memory router; auth is a stand-in, fetch is
// refused and all data is synthetic.
import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => (await import('./support/fakeFirebase.js')).appModule());
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

const authState = vi.hoisted(() => ({ current: {} }));
vi.mock('../src/context/useAuth', () => ({ useAuth: () => authState.current }));

// Pages that can be told to crash while rendering.
const crash = vi.hoisted(() => ({ settings: false, login: false }));
const SECRET = 'secret-crash-detail-7f3a';
vi.mock('../src/pages/Settings.jsx', async (importOriginal) => {
  const Real = (await importOriginal()).default;
  return {
    default: function MaybeCrashingSettings(props) {
      if (crash.settings) throw new Error(SECRET);
      return <Real {...props} />;
    },
  };
});
vi.mock('../src/pages/auth/Login.jsx', async (importOriginal) => {
  const Real = (await importOriginal()).default;
  return {
    default: function MaybeCrashingLogin(props) {
      if (crash.login) throw new Error(SECRET);
      return <Real {...props} />;
    },
  };
});

import ErrorPage from '../src/pages/ErrorPage.jsx';
import RootLayout from '../src/routes/RootLayout.jsx';
import { router as appRouter } from '../src/router.jsx';

const LOAD_TIMEOUT = 15_000;
vi.setConfig({ testTimeout: 30_000 });
const RELOAD_KEY = 'resumecraft:chunk-reload-at';
const USER = { uid: 'uid-shell', email: 'shell.user@example.test', displayName: 'Shell User', emailVerified: true };

function signedIn(profile = {}) {
  authState.current = {
    user: USER,
    profile: { firebase_uid: USER.uid, plan_code: 'pro', is_admin: true, ...profile },
    sessionStatus: 'ready',
    loading: false,
    needsEmailVerification: false,
    logout: vi.fn(async () => {}),
    retrySession: vi.fn(async () => {}),
    refreshProfile: vi.fn(async () => null),
  };
}

function signedOut() {
  authState.current = {
    user: null,
    profile: null,
    sessionStatus: 'signed-out',
    loading: false,
    needsEmailVerification: false,
    logout: vi.fn(async () => {}),
    retrySession: vi.fn(async () => {}),
    refreshProfile: vi.fn(async () => null),
  };
}

async function visit(routes, path) {
  const memoryRouter = createMemoryRouter(routes, { initialEntries: [path] });
  await act(async () => { render(<RouterProvider router={memoryRouter} />); });
  // Route `lazy` loads page code first; a cold module transform can be slow.
  await waitFor(() => expect(memoryRouter.state.initialized).toBe(true), { timeout: LOAD_TIMEOUT });
  return memoryRouter;
}

function expectNoErrorDetails() {
  expect(document.body).not.toHaveTextContent(SECRET);
  expect(document.body).not.toHaveTextContent(/at \S+ \(|\.jsx:\d+|Unexpected Application Error/);
}

function stubReload() {
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  return reload;
}

// A route whose code fails to load, as after a deploy replaced the chunk.
const chunkFailRoutes = () => [{
  element: <RootLayout />,
  errorElement: <ErrorPage fullPage />,
  children: [{
    path: '/',
    lazy: async () => {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/Page-old.js');
    },
  }],
}];

beforeEach(() => {
  crash.settings = false;
  crash.login = false;
  document.title = 'before';
  localStorage.clear();
  sessionStorage.clear();
  signedOut();
  vi.stubGlobal('fetch', vi.fn(async (url) => { throw new Error(`Unexpected request: ${url}`); }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => appRouter.dispose());

describe('SHELL-003: crashes in real routes', () => {
  it('keeps the sidebar when a dashboard page throws, and never shows the error', async () => {
    signedIn();
    crash.settings = true;

    await visit(appRouter.routes, '/dashboard/settings');

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    const shell = document.querySelector('.dashboard-shell');
    expect(shell).not.toBeNull();
    expect(shell.querySelector('.dashboard-sidebar nav')).not.toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to home page' })).toBeNull();
    expectNoErrorDetails();
    expect(document.title).toBe('Something went wrong | ResumeCraft');
  });

  it('keeps the auth layout and offers the home page when a sign-in page throws', async () => {
    crash.login = true;

    await visit(appRouter.routes, '/auth/login');

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(document.querySelector('.auth-shell')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Go to home page' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Back to dashboard' })).toBeNull();
    expectNoErrorDetails();
  });

  it('reloads when Reload page is pressed', async () => {
    signedIn();
    crash.settings = true;
    const reload = stubReload();
    await visit(appRouter.routes, '/dashboard/settings');

    await act(async () => { screen.getByRole('button', { name: 'Reload page' }).click(); });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recovers through the sidebar after a crash', async () => {
    signedIn();
    crash.settings = true;
    const memoryRouter = await visit(appRouter.routes, '/dashboard/settings');
    await screen.findByRole('heading', { level: 1, name: 'Something went wrong' });

    crash.settings = false;
    await act(async () => { await memoryRouter.navigate('/dashboard/career-lab'); });

    await waitFor(() => expect(screen.queryByText('Something went wrong')).toBeNull(), { timeout: LOAD_TIMEOUT });
    expect(document.title).toBe('Career Lab | ResumeCraft');
  });

  it('shows "Page not found" without a reload button for a 404 route error', async () => {
    const routes = [{
      element: <RootLayout />,
      errorElement: <ErrorPage fullPage />,
      children: [{
        path: '/gone',
        loader: () => { throw new Response('', { status: 404 }); },
        element: <p>never</p>,
      }],
    }];

    await visit(routes, '/gone');

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload page' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Go to home page' })).toHaveAttribute('href', '/');
    await waitFor(() => expect(document.title).toBe('Page not found | ResumeCraft'));
  });

  // KNOWN BUG trigger (root cause in CareerLabToolPage.jsx, another file):
  // TOOL_MAP['constructor'] is Object's constructor, so the page throws. The
  // boundary must contain it. This passes today, so it is a regression test.
  it('contains the crash from /dashboard/career-lab/tools/constructor inside the shell', async () => {
    signedIn();

    await visit(appRouter.routes, '/dashboard/career-lab/tools/constructor');

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(document.querySelector('.dashboard-shell .dashboard-sidebar')).not.toBeNull();
    expect(document.body).not.toHaveTextContent(/Unexpected Application Error|TypeError|is not a function/);
    expect(document.title).toBe('Something went wrong | ResumeCraft');
  });
});

describe('SHELL-003: chunk-load failures', () => {
  it('reloads on a real lazy route failure and records the time', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const reload = stubReload();

    await visit(chunkFailRoutes(), '/');

    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe('1000000');
    expect(screen.getByText(/new version of ResumeCraft/i)).toBeInTheDocument();
  });

  it('does not reload again when the last reload was under 10 s ago', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_009_999);
    sessionStorage.setItem(RELOAD_KEY, '1000000');
    const reload = stubReload();

    await visit(chunkFailRoutes(), '/');

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to home page' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('/assets/Page-old.js');
  });

  it('reloads again once the 10 s window has passed', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_010_001);
    sessionStorage.setItem(RELOAD_KEY, '1000000');
    const reload = stubReload();

    await visit(chunkFailRoutes(), '/');

    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe('1010001');
  });

  it('does not reload for an ordinary crash', async () => {
    signedIn();
    crash.settings = true;
    const reload = stubReload();

    await visit(appRouter.routes, '/dashboard/settings');
    await screen.findByRole('heading', { level: 1, name: 'Something went wrong' });

    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });
});

describe('SHELL-007: document titles', () => {
  it.each([
    ['/', 'ResumeCraft'],
    ['/auth/login', 'Sign in | ResumeCraft'],
    ['/auth/signup', 'Create account | ResumeCraft'],
    ['/auth/nope', 'Page not found | ResumeCraft'],
    ['/nope', 'Page not found | ResumeCraft'],
  ])('signed out, %s is titled "%s"', async (path, expected) => {
    await visit(appRouter.routes, path);

    await waitFor(() => expect(document.title).toBe(expected), { timeout: LOAD_TIMEOUT });
  });

  it.each([
    ['/dashboard', 'Dashboard | ResumeCraft'],
    ['/dashboard/resume/new', 'New resume | ResumeCraft'],
    ['/dashboard/cover-letter/new', 'New cover letter | ResumeCraft'],
    ['/dashboard/editor', 'Document workspace | ResumeCraft'],
    ['/dashboard/payment', 'Plans | ResumeCraft'],
    ['/dashboard/settings', 'Settings | ResumeCraft'],
    ['/dashboard/admin', 'Admin | ResumeCraft'],
    ['/dashboard/career-lab', 'Career Lab | ResumeCraft'],
    ['/dashboard/career-lab/tools/salary-estimate', 'Salary Estimate | ResumeCraft'],
    ['/dashboard/career-lab/tools/bogus', 'Career Lab | ResumeCraft'],
    ['/dashboard/nope', 'Page not found | ResumeCraft'],
  ])('signed in, %s is titled "%s"', async (path, expected) => {
    signedIn();

    await visit(appRouter.routes, path);

    await waitFor(() => expect(document.title).toBe(expected), { timeout: LOAD_TIMEOUT });
  });

  it('updates the title on client navigation', async () => {
    signedIn();
    const memoryRouter = await visit(appRouter.routes, '/dashboard/settings');
    await waitFor(() => expect(document.title).toBe('Settings | ResumeCraft'));

    await act(async () => { await memoryRouter.navigate('/dashboard/career-lab/tools/salary-estimate'); });
    await waitFor(() => expect(document.title).toBe('Salary Estimate | ResumeCraft'));

    await act(async () => { await memoryRouter.navigate('/dashboard/payment'); });
    await waitFor(() => expect(document.title).toBe('Plans | ResumeCraft'));
  });
});

describe('SHELL-007: focus and pending state', () => {
  function shellRoutes(children) {
    return [{ element: <RootLayout />, children }];
  }

  it('does not move focus on the first load', async () => {
    await visit(shellRoutes([{ path: '/', element: <main><h1>First</h1></main> }]), '/');

    expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it('focuses main when the new page has no h1', async () => {
    const memoryRouter = await visit(shellRoutes([
      { path: '/', element: <main><h1>First</h1></main> },
      { path: '/plain', element: <main data-testid="plain-main"><p>No heading here</p></main> },
    ]), '/');

    await act(async () => { await memoryRouter.navigate('/plain'); });

    const main = screen.getByTestId('plain-main');
    expect(document.activeElement).toBe(main);
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('focuses the h1 inside main, not an h1 outside it', async () => {
    const memoryRouter = await visit(shellRoutes([
      { path: '/', element: <main><h1>First</h1></main> },
      { path: '/next', element: <><h1>Brand</h1><main><h1>Next page</h1></main></> },
    ]), '/');

    await act(async () => { await memoryRouter.navigate('/next'); });

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Next page' }));
  });

  it('announces "Loading page..." while a lazy route loads, then clears it', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const memoryRouter = await visit(shellRoutes([
      { path: '/', element: <main><h1>Start</h1></main> },
      { path: '/slow', lazy: async () => { await gate; return { Component: () => <main><h1>Slow page</h1></main> }; } },
    ]), '/');
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent('');

    let done;
    act(() => { done = memoryRouter.navigate('/slow'); });
    await waitFor(() => expect(live).toHaveTextContent('Loading page...'));
    expect(screen.getByRole('heading', { name: 'Start' })).toBeInTheDocument();

    await act(async () => { release(); await done; });
    expect(live.textContent).toBe('');
    expect(screen.queryByTestId('route-pending')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Slow page' })).toBeInTheDocument();
  });
});

describe('SHELL-019: not-found routing', () => {
  it('shows the full-page not-found page outside any layout for /nope', async () => {
    await visit(appRouter.routes, '/nope');

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(document.querySelector('.auth-shell')).toBeNull();
    expect(document.querySelector('.dashboard-shell')).toBeNull();
  });

  it('redirects /auth to /auth/login and shows the sign-in page', async () => {
    const memoryRouter = await visit(appRouter.routes, '/auth');

    await waitFor(() => expect(memoryRouter.state.location.pathname).toBe('/auth/login'));
    expect(memoryRouter.state.historyAction).toBe('REPLACE');
    await waitFor(() => expect(document.title).toBe('Sign in | ResumeCraft'));
  });

  it('sends a signed-out visitor of an unknown dashboard URL to sign in, not a not-found page', async () => {
    const memoryRouter = await visit(appRouter.routes, '/dashboard/nope');

    await waitFor(() => expect(memoryRouter.state.location.pathname).toBe('/auth/login'));
    expect(screen.queryByText('Page not found')).toBeNull();
  });
});
