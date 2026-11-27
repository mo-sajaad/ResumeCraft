// SHELL-003: route errors show a usable page with a way back, never a stack.
// Uses the routes of src/router.jsx in a memory router; auth is a stand-in and
// all data is synthetic.
import { act, render, screen, waitFor } from '@testing-library/react';
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
  // Route `lazy` loads the matched pages' code before the first render.
  await waitFor(() => expect(memoryRouter.state.initialized).toBe(true));
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

    await waitFor(() => expect(memoryRouter.state.location.pathname).toBe('/auth/login'));
  });
});

describe('SHELL-007: navigation titles, focus, scroll and pending state', () => {
  it('names the page in the document title', async () => {
    signedIn();

    await visit(appRouter.routes, '/dashboard/career-lab/tools/salary-estimate');
    await screen.findByRole('heading', { level: 1, name: /career command center/i });
    expect(document.title).toBe('Salary Estimate | ResumeCraft');
  });

  it('titles the not-found page', async () => {
    await visit(appRouter.routes, '/nope');

    expect(document.title).toBe('Page not found | ResumeCraft');
  });

  it('moves focus to the new page heading after a navigation', async () => {
    signedIn();
    const memoryRouter = await visit(appRouter.routes, '/dashboard/nope');
    await screen.findByRole('heading', { level: 1, name: 'Page not found' });

    await act(async () => { await memoryRouter.navigate('/dashboard/settings'); });

    const heading = await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(document.title).toBe('Settings | ResumeCraft');
    expect(document.activeElement).toBe(heading);
  });

  it('shows a pending indicator while the next page loads', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const routes = [{
      element: appRouter.routes[0].element,
      children: [
        { path: '/', element: <p>Start</p> },
        { path: '/slow', lazy: async () => { await gate; return { Component: () => <main><h1>Slow page</h1></main> }; } },
      ],
    }];
    const memoryRouter = await visit(routes, '/');

    let done;
    act(() => { done = memoryRouter.navigate('/slow'); });
    expect(await screen.findByTestId('route-pending')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();

    await act(async () => { release(); await done; });
    expect(screen.queryByTestId('route-pending')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Slow page' }));
  });
});
