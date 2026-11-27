// SHELL-003: route errors show a usable page with a way back, never a stack.
// Uses the routes of src/router.jsx in a memory router; auth is a stand-in and
// all data is synthetic.
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => (await import('./support/fakeFirebase.js')).appModule());
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

const authState = vi.hoisted(() => ({ current: {} }));
vi.mock('../src/context/useAuth', () => ({ useAuth: () => authState.current }));

import ErrorPage from '../src/pages/ErrorPage.jsx';
import { router as appRouter } from '../src/router.jsx';

const USER = { uid: 'uid-router', email: 'router.user@example.test', displayName: 'Router User', emailVerified: true };

function signedIn() {
  authState.current = {
    user: USER,
    profile: { firebase_uid: USER.uid, plan_code: 'pro' },
    sessionStatus: 'ready',
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
  return memoryRouter;
}

function Boom() {
  throw new Error('secret stack detail');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url) => { throw new Error(`Unexpected request: ${url}`); }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => appRouter.dispose());

describe('SHELL-003: route error boundaries', () => {
  it('shows a plain error page with reload and home actions, without the error text', async () => {
    await visit([{ path: '/', element: <Boom />, errorElement: <ErrorPage fullPage /> }], '/');

    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to home page' })).toHaveAttribute('href', '/');
    expect(document.body).not.toHaveTextContent('secret stack detail');
  });

  it('offers the dashboard as the way back inside the dashboard', async () => {
    await visit([{ path: '/dashboard/x', element: <Boom />, errorElement: <ErrorPage /> }], '/dashboard/x');

    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/dashboard');
  });

  it('reloads once on a failed chunk import, then shows the page', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    function ChunkFail() {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/Settings-abc.js');
    }
    const routes = [{ path: '/', element: <ChunkFail />, errorElement: <ErrorPage fullPage /> }];

    await visit(routes, '/');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/new version of ResumeCraft/i)).toBeInTheDocument();
  });

  it('keeps the dashboard shell when a dashboard page crashes', async () => {
    signedIn();

    // A tool id that is an Object.prototype key makes the tool page throw.
    await visit(appRouter.routes, '/dashboard/career-lab/tools/constructor');

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(document.querySelector('.dashboard-shell')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toBeInTheDocument();
  });
});

describe('SHELL-019: unknown URLs', () => {
  it.each([['/nope'], ['/auth/nope']])('shows a not-found page with a link home for %s', async (path) => {
    await visit(appRouter.routes, path);

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to home page' })).toHaveAttribute('href', '/');
  });

  it.each([['/dashboard/nope'], ['/dashboard/career-lab/bogus']])('keeps the shell for %s', async (path) => {
    signedIn();

    await visit(appRouter.routes, path);

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(document.querySelector('.dashboard-shell')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/dashboard');
  });

  it('sends /auth to the sign-in page', async () => {
    authState.current = { ...authState.current, user: null, loading: false, needsEmailVerification: false };

    const memoryRouter = await visit(appRouter.routes, '/auth');

    expect(memoryRouter.state.location.pathname).toBe('/auth/login');
  });
});
