// IDENTITY-013: Settings sends only the preferences that changed, applies the
// saved values to the loaded profile, validates a new password before saving
// anything, and keeps the toggles disabled until the profile is loaded. Uses the
// real provider and utils/auth; Firebase and the API are fakes, and all data is
// synthetic.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { vi } from 'vitest';

const fakes = vi.hoisted(() => ({ updatePassword: null }));

vi.mock('../src/firebase', async () => ({
  ...(await import('./support/fakeFirebase.js')).appModule(),
  updatePassword: (...args) => fakes.updatePassword(...args),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

import { AuthProvider } from '../src/context/AuthProvider.jsx';
import Settings from '../src/pages/Settings.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import { api, callsTo, deferred, reply, settle, setUpSignInTest, tearDownSignInTest } from './support/authHarness.jsx';
import { firebase } from './support/fakeFirebase.js';

const PREFERENCES = '/api/users/uid-one/preferences';
const SAVED = 'Preferences saved.';

// The server's stored preferences.
let stored;

beforeEach(() => {
  setUpSignInTest();
  fakes.updatePassword = vi.fn(async () => {});
  stored = { weekly_insights: false, job_alerts: true };
  api.profile = async (uid) => reply(200, { firebase_uid: uid, email: `${uid}@example.test`, ...stored });
  // Like the server: stores the fields it was sent and answers with all of them.
  api.preferences = async (init) => {
    const body = JSON.parse(init.body);
    if ('weeklyInsights' in body) stored.weekly_insights = body.weeklyInsights;
    if ('jobAlerts' in body) stored.job_alerts = body.jobAlerts;
    return reply(200, { ...stored });
  };
  const harness = globalThis.fetch.getMockImplementation();
  globalThis.fetch.mockImplementation((url, init = {}) => (
    url === PREFERENCES ? api.preferences(init) : harness(url, init)
  ));
});

afterEach(tearDownSignInTest);

function Nav() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      <button type="button" onClick={() => navigate('/settings')}>Go to settings</button>
    </>
  );
}

// `/settings` is guarded as in the app; `/unguarded-settings` shows Settings
// before the profile has loaded.
async function openSettings(path = '/settings') {
  firebase.auth.currentUser = firebase.nextUser;
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Nav />
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<main aria-label="Dashboard" />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="/unguarded-settings" element={<Settings />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await settle();
}

// Neither toggle has an accessible name yet (IDENTITY-017), so by order.
const toggles = () => {
  const [weekly, jobs] = screen.getAllByRole('checkbox');
  return { weekly, jobs };
};

const click = (name) => act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
const save = async () => { await click('Save changes'); await settle(); };
const sentBodies = () => callsTo('/preferences').map(([, init]) => JSON.parse(init.body));

async function reopenSettings() {
  await click('Go to dashboard');
  expect(screen.getByRole('main', { name: 'Dashboard' })).toBeInTheDocument();
  await click('Go to settings');
}

function typePassword(password, confirm = password) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } });
}

describe('IDENTITY-013: only changed preferences are sent', () => {
  it('shows the stored values', async () => {
    await openSettings();

    expect(toggles().weekly).not.toBeChecked();
    expect(toggles().jobs).toBeChecked();
  });

  it('sends only the preference that changed', async () => {
    await openSettings();
    fireEvent.click(toggles().weekly);

    await save();

    expect(sentBodies()).toEqual([{ weeklyInsights: true }]);
    expect(callsTo('/preferences')[0][1]).toMatchObject({ method: 'PATCH' });
    expect(screen.getByText(SAVED)).toBeInTheDocument();
  });

  it('sends both when both changed', async () => {
    await openSettings();
    fireEvent.click(toggles().weekly);
    fireEvent.click(toggles().jobs);

    await save();

    expect(sentBodies()).toEqual([{ weeklyInsights: true, jobAlerts: false }]);
  });

  it.each([
    ['nothing changed', () => {}],
    ['a toggle was switched back', () => { fireEvent.click(toggles().jobs); fireEvent.click(toggles().jobs); }],
  ])('sends no request when %s, and still says it saved', async (_label, change) => {
    await openSettings();
    change();

    await save();

    expect(callsTo('/preferences')).toEqual([]);
    expect(screen.getByText(SAVED)).toBeInTheDocument();
  });
});

describe('IDENTITY-013: the saved values are kept', () => {
  it('shows the saved values after reopening Settings, without reading the profile again', async () => {
    await openSettings();
    const reads = callsTo('/users/uid-one').length;
    fireEvent.click(toggles().weekly);
    await save();

    await reopenSettings();

    expect(toggles().weekly).toBeChecked();
    expect(toggles().jobs).toBeChecked();
    expect(callsTo('/users/uid-one')).toHaveLength(reads);
  });

  it('sends nothing on a second save after the first one was applied', async () => {
    await openSettings();
    fireEvent.click(toggles().weekly);
    await save();

    await save();

    expect(sentBodies()).toEqual([{ weeklyInsights: true }]);
  });

  it('applies the values in the server\'s answer', async () => {
    await openSettings();
    // Another device turned job alerts off meanwhile; the answer carries both.
    api.preferences = async () => reply(200, { weekly_insights: true, job_alerts: false });
    fireEvent.click(toggles().weekly);
    await save();

    await reopenSettings();

    expect(toggles().weekly).toBeChecked();
    expect(toggles().jobs).not.toBeChecked();
  });

  it('keeps the old values in the profile when the save fails', async () => {
    await openSettings();
    api.preferences = async () => reply(500, { error: 'Synthetic: could not save.' });
    fireEvent.click(toggles().weekly);

    await save();

    expect(screen.getByText('Synthetic: could not save.')).toBeInTheDocument();
    await reopenSettings();
    expect(toggles().weekly).not.toBeChecked();
    expect(toggles().jobs).toBeChecked();
  });
});

describe('IDENTITY-013: an invalid new password saves nothing', () => {
  it.each([
    ['too short', 'short', 'short', 'Password must be at least 6 characters long.'],
    ['not confirmed', 'synthetic-password-2', 'synthetic-password-3', 'Passwords do not match.'],
  ])('sends no preferences and changes no password when it is %s', async (_label, password, confirm, message) => {
    await openSettings();
    fireEvent.click(toggles().weekly);
    typePassword(password, confirm);

    await save();

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(SAVED)).not.toBeInTheDocument();
    expect(callsTo('/preferences')).toEqual([]);
    expect(fakes.updatePassword).not.toHaveBeenCalled();
    expect(stored.weekly_insights).toBe(false);
    // The unsaved choice stays on screen to be saved once the password is fixed.
    expect(toggles().weekly).toBeChecked();
  });
});

describe('IDENTITY-013: toggles need a loaded profile', () => {
  it('disables the toggles until the profile has loaded, and sends nothing before', async () => {
    const held = deferred();
    api.profile = () => held.promise;
    await openSettings('/unguarded-settings');

    expect(toggles().weekly).toBeDisabled();
    expect(toggles().jobs).toBeDisabled();
    await save();
    expect(callsTo('/preferences')).toEqual([]);

    await act(async () => held.resolve(reply(200, { firebase_uid: 'uid-one', ...stored })));
    await settle();

    expect(toggles().weekly).toBeEnabled();
    expect(toggles().jobs).toBeEnabled();
    expect(toggles().jobs).toBeChecked();
  });

  it('keeps the toggles disabled when the profile cannot be loaded', async () => {
    api.profile = async () => reply(500);
    await openSettings('/unguarded-settings');

    expect(toggles().weekly).toBeDisabled();
    expect(toggles().jobs).toBeDisabled();
  });

  it('disables the toggles while a save is running', async () => {
    await openSettings();
    const held = deferred();
    api.preferences = () => held.promise;
    fireEvent.click(toggles().weekly);

    await click('Save changes');

    expect(toggles().weekly).toBeDisabled();
    expect(toggles().jobs).toBeDisabled();

    await act(async () => held.resolve(reply(200, { weekly_insights: true, job_alerts: true })));
    await settle();

    expect(toggles().weekly).toBeEnabled();
    expect(toggles().weekly).toBeChecked();
  });
});
