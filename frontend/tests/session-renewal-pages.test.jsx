// IDENTITY-015: pages that call the API renew an expired session once and send
// the request again. A 401 makes exactly one exchange and one resend with the
// same method and body, and the page then shows its usual success; a second
// 401 shows the page's usual error, without another renewal. Uses the real
// provider and utils/auth; Firebase and the API are fakes, and all data is
// synthetic.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../src/firebase', async () => ({
  ...(await import('./support/fakeFirebase.js')).appModule(),
  updatePassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock('firebase/auth', async () => (await import('./support/fakeFirebase.js')).sdkModule());

import { AuthProvider } from '../src/context/AuthProvider.jsx';
import { ROUTES } from '../src/constants/routes';
import AdminDashboard from '../src/pages/AdminDashboard.jsx';
import Payment from '../src/pages/Payment.jsx';
import Settings from '../src/pages/Settings.jsx';
import CoverLetterNew from '../src/pages/dashboard/CoverLetterNew.jsx';
import DocumentWorkspace from '../src/pages/dashboard/DocumentWorkspace.jsx';
import ResumeNew from '../src/pages/dashboard/ResumeNew.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import { api, reply, seen, settle, setUpSignInTest, tearDownSignInTest } from './support/authHarness.jsx';
import { firebase } from './support/fakeFirebase.js';

const EXPIRED = 'Synthetic: session expired.';

// "METHOD url" -> handler(init) for the page's API, and how many 401s each
// still answers before the handler runs.
let handlers;
let expired;
let locations;

const keyOf = (method, url) => `${method} ${url}`;
const on = (method, url, handler) => { handlers[keyOf(method, url)] = handler; };
const expire = (method, url, times = 1) => { expired[keyOf(method, url)] = times; };

// The requests sent to one endpoint, as [url, init].
const sent = (method, url) => globalThis.fetch.mock.calls.filter(
  ([callUrl, init = {}]) => keyOf(init.method || 'GET', callUrl) === keyOf(method, url)
);

// The sign-in itself makes one exchange (IDENTITY-014); the rest are renewals.
const renewals = () => seen.exchanges.length - 1;

const html = (markup) => ({ ...reply(200), text: async () => markup });

beforeEach(() => {
  setUpSignInTest();
  handlers = {};
  expired = {};
  locations = [];
  api.profile = async (uid) => (uid === seen.session
    ? reply(200, {
      firebase_uid: uid,
      email: `${uid}@example.test`,
      full_name: 'Jane Doe',
      plan_code: 'premium',
      is_admin: true,
      weekly_insights: false,
      job_alerts: true,
    })
    : reply(401, { error: EXPIRED }));

  const harness = globalThis.fetch.getMockImplementation();
  globalThis.fetch.mockImplementation(async (url, init = {}) => {
    const key = keyOf(init.method || 'GET', url);
    if (!handlers[key]) return harness(url, init);
    if (expired[key] > 0) {
      expired[key] -= 1;
      return reply(401, { error: EXPIRED });
    }
    return handlers[key](init);
  });
});

afterEach(tearDownSignInTest);

function LocationProbe() {
  const { pathname, search } = useLocation();
  useEffect(() => { locations.push(`${pathname}${search}`); }, [pathname, search]);
  return null;
}

// Signs in as uid-one and opens `path`, guarded as in the app.
async function open(path, routePath, element) {
  firebase.auth.currentUser = firebase.nextUser;
  render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <AuthProvider>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path={routePath} element={element} />
            <Route path="*" element={<main aria-label="Elsewhere" />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await settle();
}

const click = async (name) => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
  await settle();
};

// One renewal, then the same request again with the session cookie.
function expectOneRenewalAndResend(method, url) {
  expect(renewals()).toBe(1);
  const requests = sent(method, url);
  expect(requests).toHaveLength(2);
  const [first, second] = requests.map(([, init]) => init);
  expect(second.method).toBe(first.method);
  expect(second.body).toBe(first.body);
  expect(second.credentials).toBe('include');
}

describe('IDENTITY-015: Settings', () => {
  const PREFERENCES = '/api/users/uid-one/preferences';

  beforeEach(() => {
    on('PATCH', PREFERENCES, async (init) => reply(200, { weekly_insights: JSON.parse(init.body).weeklyInsights, job_alerts: true }));
  });

  async function savePreferences() {
    await open(ROUTES.SETTINGS, ROUTES.SETTINGS, <Settings />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    await click('Save changes');
  }

  it('renews once and saves the preferences after a 401', async () => {
    expire('PATCH', PREFERENCES);

    await savePreferences();

    expectOneRenewalAndResend('PATCH', PREFERENCES);
    expect(JSON.parse(sent('PATCH', PREFERENCES)[1][1].body)).toEqual({ weeklyInsights: true });
    expect(screen.getByText('Preferences saved.')).toBeInTheDocument();
  });

  it('shows the save error after a second 401', async () => {
    expire('PATCH', PREFERENCES, 2);

    await savePreferences();

    expectOneRenewalAndResend('PATCH', PREFERENCES);
    expect(screen.getByText(EXPIRED)).toBeInTheDocument();
    expect(screen.queryByText('Preferences saved.')).not.toBeInTheDocument();
  });
});

describe('IDENTITY-015: Payment', () => {
  const CHECKOUT = '/api/billing/checkout-session';
  const PORTAL = '/api/billing/portal-session';
  let assign;

  beforeEach(() => {
    assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    on('POST', CHECKOUT, async () => reply(200, { url: 'https://checkout.example.test/session' }));
    on('POST', PORTAL, async () => reply(200, { url: 'https://portal.example.test/session' }));
  });

  it('renews once and still redirects to checkout after a 401', async () => {
    expire('POST', CHECKOUT);
    await open(ROUTES.PAYMENT, ROUTES.PAYMENT, <Payment />);

    await click('Upgrade to Pro');

    expectOneRenewalAndResend('POST', CHECKOUT);
    expect(JSON.parse(sent('POST', CHECKOUT)[1][1].body)).toEqual({ plan: 'pro' });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('https://checkout.example.test/session');
  });

  it('renews once and still redirects to the billing portal after a 401', async () => {
    expire('POST', PORTAL);
    await open(ROUTES.PAYMENT, ROUTES.PAYMENT, <Payment />);

    await click('Manage Billing');

    expectOneRenewalAndResend('POST', PORTAL);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('https://portal.example.test/session');
  });

  it('shows the checkout error and does not redirect after a second 401', async () => {
    expire('POST', CHECKOUT, 2);
    await open(ROUTES.PAYMENT, ROUTES.PAYMENT, <Payment />);

    await click('Upgrade to Pro');

    expectOneRenewalAndResend('POST', CHECKOUT);
    expect(screen.getByText(EXPIRED)).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('IDENTITY-015: AdminDashboard', () => {
  const FLAGS = '/api/admin/feature-flags';
  const USAGE = '/api/admin/analytics/usage?days=14';
  const AUDIT = '/api/admin/audit-logs?limit=50';
  const FLAG = '/api/admin/feature-flags/synthetic_flag';
  let enabled;

  beforeEach(() => {
    enabled = false;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    on('GET', FLAGS, async () => reply(200, {
      flags: [{ key: 'synthetic_flag', description: 'Synthetic flag', enabled, rollout_percent: 50 }],
    }));
    on('GET', USAGE, async () => reply(200, { events: [] }));
    on('GET', AUDIT, async () => reply(200, { logs: [] }));
    on('PATCH', FLAG, async (init) => {
      enabled = JSON.parse(init.body).enabled;
      return reply(200, { flag: { key: 'synthetic_flag', description: 'Synthetic flag', enabled, rollout_percent: 50 } });
    });
  });

  const flagRow = () => screen.getByRole('row', { name: /synthetic_flag/ });

  it('renews once for three concurrent 401s and loads the dashboard', async () => {
    expire('GET', FLAGS);
    expire('GET', USAGE);
    expire('GET', AUDIT);

    await open(ROUTES.ADMIN, ROUTES.ADMIN, <AdminDashboard />);

    expectOneRenewalAndResend('GET', FLAGS);
    expect(sent('GET', USAGE)).toHaveLength(2);
    expect(sent('GET', AUDIT)).toHaveLength(2);
    expect(flagRow()).toHaveTextContent('Off');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renews once and saves the flag after a 401 on the PATCH', async () => {
    await open(ROUTES.ADMIN, ROUTES.ADMIN, <AdminDashboard />);
    expire('PATCH', FLAG);

    await click('Turn on synthetic_flag');

    expectOneRenewalAndResend('PATCH', FLAG);
    // Only `enabled`, so the stored rollout is kept (ADMIN-006).
    expect(JSON.parse(sent('PATCH', FLAG)[1][1].body)).toEqual({ enabled: true });
    expect(flagRow()).toHaveTextContent('On');
  });

  it('shows the load error after a second 401', async () => {
    expire('GET', FLAGS, 2);

    await open(ROUTES.ADMIN, ROUTES.ADMIN, <AdminDashboard />);

    expectOneRenewalAndResend('GET', FLAGS);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load feature flags');
  });

  it('shows the update error after a second 401 on the PATCH', async () => {
    await open(ROUTES.ADMIN, ROUTES.ADMIN, <AdminDashboard />);
    expire('PATCH', FLAG, 2);

    await click('Turn on synthetic_flag');

    expectOneRenewalAndResend('PATCH', FLAG);
    expect(screen.getByRole('alert')).toHaveTextContent(EXPIRED);
    expect(enabled).toBe(false);
  });
});

describe('IDENTITY-015: ResumeNew', () => {
  const LOAD = '/api/resumes/r-1';
  const GENERATE = '/api/resumes/generate';
  const EDITOR = `${ROUTES.DOCUMENT_WORKSPACE}?type=resume&id=r-2&style=modern`;

  beforeEach(() => {
    on('GET', LOAD, async () => reply(200, {
      id: 'r-1',
      full_name: 'Jane Doe',
      email: 'jane@example.test',
      template_key: 'modern',
      generated_text: JSON.stringify({
        skills: ['Synthetic skill'],
        experience: [{ title: 'Synthetic role', company: 'Example Co' }],
      }),
    }));
    on('GET', '/api/resumes/r-1/preview?style=modern', async () => html('<p>Synthetic preview</p>'));
    on('POST', GENERATE, async () => reply(200, { resumeId: 'r-2' }));
  });

  const openResume = () => open(`${ROUTES.RESUME_NEW}?resumeId=r-1`, ROUTES.RESUME_NEW, <ResumeNew />);

  it('renews once and opens the saved resume after a 401 on load', async () => {
    expire('GET', LOAD);

    await openResume();

    expectOneRenewalAndResend('GET', LOAD);
    expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
    expect(screen.getByTitle('Resume Preview')).toBeInTheDocument();
  });

  it('renews once and saves the resume after a 401 on generate', async () => {
    await openResume();
    expire('POST', GENERATE);

    await click('Generate Resume');

    expectOneRenewalAndResend('POST', GENERATE);
    expect(JSON.parse(sent('POST', GENERATE)[1][1].body).personal).toMatchObject({ fullName: 'Jane Doe' });
    expect(locations.at(-1)).toBe(EDITOR);
  });

  it('shows the generate error and stays after a second 401', async () => {
    await openResume();
    expire('POST', GENERATE, 2);

    await click('Generate Resume');

    expectOneRenewalAndResend('POST', GENERATE);
    expect(screen.getByText(EXPIRED)).toBeInTheDocument();
    expect(locations).not.toContain(EDITOR);
  });
});

describe('IDENTITY-015: CoverLetterNew', () => {
  const LOAD = '/api/cover-letters/c-1';
  const GENERATE = '/api/cover-letters/generate';
  const EDITOR = `${ROUTES.DOCUMENT_WORKSPACE}?type=cover-letter&id=c-2&style=modern`;

  beforeEach(() => {
    on('GET', LOAD, async () => reply(200, {
      id: 'c-1',
      full_name: 'Jane Doe',
      email: 'jane@example.test',
      company_name: 'Example Co',
      position_title: 'Synthetic role',
      body_paragraphs: 'Synthetic body.',
    }));
    on('GET', '/api/cover-letters/c-1/preview?style=modern', async () => html('<p>Synthetic preview</p>'));
    on('POST', GENERATE, async () => reply(200, { coverLetterId: 'c-2', coverLetterText: 'Synthetic letter.' }));
  });

  const openLetter = () => open(`${ROUTES.COVERLETTER_NEW}?coverLetterId=c-1`, ROUTES.COVERLETTER_NEW, <CoverLetterNew />);

  it('renews once and opens the saved letter after a 401 on load', async () => {
    expire('GET', LOAD);

    await openLetter();

    expectOneRenewalAndResend('GET', LOAD);
    expect(screen.getByDisplayValue('Example Co')).toBeInTheDocument();
  });

  it('renews once and saves the letter after a 401 on generate', async () => {
    await openLetter();
    expire('POST', GENERATE);

    await click('Generate Cover Letter');

    expectOneRenewalAndResend('POST', GENERATE);
    expect(JSON.parse(sent('POST', GENERATE)[1][1].body).job).toMatchObject({ company: 'Example Co' });
    expect(locations.at(-1)).toBe(EDITOR);
  });

  it('shows the generate error and stays after a second 401', async () => {
    await openLetter();
    expire('POST', GENERATE, 2);

    await click('Generate Cover Letter');

    expectOneRenewalAndResend('POST', GENERATE);
    expect(screen.getByText(EXPIRED)).toBeInTheDocument();
    expect(locations).not.toContain(EDITOR);
  });
});

describe('IDENTITY-015: DocumentWorkspace', () => {
  const DOCUMENT = '/api/resumes/r-1';
  const SAVE = '/api/workspace/document';
  const REWRITE = '/api/workspace/ai-rewrite';
  const REWRITTEN = 'AI suggestion applied to the template editor. Save to persist.';

  beforeEach(() => {
    on('GET', DOCUMENT, async () => reply(200, { title: 'Synthetic resume', summary: 'Synthetic summary.' }));
    // No template, so the page edits in its own rich editor rather than an iframe.
    on('GET', '/api/resumes/r-1/preview?style=modern', async () => reply(404, {}));
    on('PUT', SAVE, async () => reply(200, { title: 'Synthetic resume' }));
    on('PUT', DOCUMENT, async () => reply(200, {}));
    on('POST', REWRITE, async () => reply(200, { rewrittenText: 'Synthetic rewritten summary.' }));
    on('DELETE', DOCUMENT, async () => reply(204, {}));
  });

  const openWorkspace = () => open(
    `${ROUTES.DOCUMENT_WORKSPACE}?type=resume&id=r-1&style=modern`,
    ROUTES.DOCUMENT_WORKSPACE,
    <DocumentWorkspace />
  );

  async function rewrite() {
    fireEvent.change(screen.getByLabelText('AI chat prompt'), { target: { value: 'Synthetic prompt' } });
    await click('Send');
  }

  it('renews once and loads the document after a 401', async () => {
    expire('GET', DOCUMENT);

    await openWorkspace();

    expectOneRenewalAndResend('GET', DOCUMENT);
    expect(screen.getByRole('heading', { name: 'Synthetic resume' })).toBeInTheDocument();
    expect(screen.queryByText(EXPIRED)).not.toBeInTheDocument();
  });

  it('renews once and saves after a 401, without the fallback save', async () => {
    await openWorkspace();
    expire('PUT', SAVE);

    await click('Save');

    expectOneRenewalAndResend('PUT', SAVE);
    expect(JSON.parse(sent('PUT', SAVE)[1][1].body)).toEqual({
      type: 'resume', id: 'r-1', style: 'modern', text: 'Synthetic summary.',
    });
    expect(sent('PUT', DOCUMENT)).toEqual([]);
    expect(screen.getByText('Changes saved.')).toBeInTheDocument();
  });

  it('renews once and applies the AI rewrite after a 401', async () => {
    await openWorkspace();
    expire('POST', REWRITE);

    await rewrite();

    expectOneRenewalAndResend('POST', REWRITE);
    expect(JSON.parse(sent('POST', REWRITE)[1][1].body)).toMatchObject({ prompt: 'Synthetic prompt' });
    expect(screen.getByText(REWRITTEN)).toBeInTheDocument();
  });

  it('shows the AI rewrite error after a second 401', async () => {
    await openWorkspace();
    expire('POST', REWRITE, 2);

    await rewrite();

    expectOneRenewalAndResend('POST', REWRITE);
    expect(screen.getByText(EXPIRED)).toBeInTheDocument();
    expect(screen.queryByText(REWRITTEN)).not.toBeInTheDocument();
  });

  it('renews once and deletes after a 401, then leaves for the dashboard', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openWorkspace();
    expire('DELETE', DOCUMENT);

    await click('Delete');

    expectOneRenewalAndResend('DELETE', DOCUMENT);
    expect(locations.at(-1)).toBe(ROUTES.DASHBOARD);
  });
});
