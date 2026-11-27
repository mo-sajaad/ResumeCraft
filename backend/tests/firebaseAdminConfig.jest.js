// IDENTITY-016: how Firebase Admin chooses its credentials at start-up. With
// FIREBASE_PROJECT_ID set, keyless mode wins over leftover key variables and
// one warning names them; in production a conflict, or any failure to
// initialise, stops start-up; in development the export is null with a
// warning. No log line or error repeats the variables' contents. firebase-admin
// and the logger are fakes, and every value is synthetic.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Planted in the variables; none may appear in a log line or an error.
const MARKERS = ['PLANTEDA1', 'PLANTEDB2', 'PLANTEDC3', 'PLANTEDD4', 'PLANTEDE5'];

const PROJECT_ID = 'resumecraft-synthetic';
// Short, so the JSON parser's message would quote all of it.
const BAD_JSON = `${MARKERS[0]} not json`;
const OTHER_PROJECT_KEY = JSON.stringify({
  type: 'service_account',
  project_id: `other-project-${MARKERS[1]}`,
  private_key: `-----BEGIN PRIVATE KEY-----\n${MARKERS[2]}\n-----END PRIVATE KEY-----\n`,
  client_email: 'synthetic@other-project.example.test',
});
// The fake cert() refuses this key, quoting it as a parser might.
const UNUSABLE_KEY = JSON.stringify({
  type: 'service_account',
  project_id: 'synthetic-project',
  private_key: `unusable ${MARKERS[3]}`,
  client_email: 'synthetic@synthetic-project.example.test',
});

const VARIABLES = [
  'NODE_ENV',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_PRIVATE_KEY_PATH',
];

// Never created. Built here because the it.each tables are read before beforeAll.
const missingPath = path.join(os.tmpdir(), `resumecraft-missing-${process.pid}-${MARKERS[4]}.json`);

let tempDir;
let savedEnv;
let admin;
let logLines;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resumecraft-firebase-admin-'));
  if (fs.existsSync(missingPath)) throw new Error('The missing-file fixture exists.');
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  savedEnv = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of VARIABLES) delete process.env[name];

  admin = {
    apps: [],
    credential: {
      cert: jest.fn((account) => {
        if (account.private_key.startsWith('unusable')) {
          throw new Error(`Failed to parse private key: ${account.private_key}`);
        }
        return { kind: 'cert', projectId: account.project_id };
      }),
      applicationDefault: jest.fn(() => ({ kind: 'applicationDefault' })),
    },
    initializeApp: jest.fn(),
  };
  logLines = [];
});

afterEach(() => {
  for (const name of VARIABLES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

function serialise(args) {
  return JSON.stringify(args, (_key, value) => (
    value instanceof Error ? { message: value.message, stack: value.stack } : value
  ));
}

// Loads a fresh firebaseAdmin.js; returns { exported } or { error }.
function load(env) {
  Object.assign(process.env, env);
  const logger = {};
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    logger[level] = jest.fn((...args) => logLines.push({ level, text: serialise(args) }));
  }
  let result;
  jest.isolateModules(() => {
    jest.doMock('firebase-admin', () => admin);
    jest.doMock('../observability/logger', () => logger);
    try {
      result = { exported: require('../firebaseAdmin') };
    } catch (error) {
      result = { error };
    }
  });
  return result;
}

const warnings = () => logLines.filter(({ level }) => level === 'warn');

function expectNoMarkers(result) {
  const seen = [...logLines.map(({ text }) => text), serialise([result.error])].join('\n');
  for (const marker of MARKERS) expect(seen).not.toContain(marker);
}

function expectKeyless(result) {
  expect(result.error).toBeUndefined();
  expect(result.exported).toBe(admin);
  expect(admin.credential.cert).not.toHaveBeenCalled();
  expect(admin.initializeApp).toHaveBeenCalledTimes(1);
  expect(admin.initializeApp).toHaveBeenCalledWith({
    credential: { kind: 'applicationDefault' },
    projectId: PROJECT_ID,
  });
}

function writeKeyFile(contents) {
  const file = path.join(tempDir, `key-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, contents);
  return file;
}

describe('IDENTITY-016: FIREBASE_PROJECT_ID wins outside production', () => {
  it.each([
    ['unparseable FIREBASE_SERVICE_ACCOUNT_JSON', { FIREBASE_SERVICE_ACCOUNT_JSON: BAD_JSON }, ['FIREBASE_SERVICE_ACCOUNT_JSON']],
    ['a valid key for another project', { FIREBASE_SERVICE_ACCOUNT_JSON: OTHER_PROJECT_KEY }, ['FIREBASE_SERVICE_ACCOUNT_JSON']],
    ['a missing FIREBASE_PRIVATE_KEY_PATH file', { FIREBASE_PRIVATE_KEY_PATH: missingPath }, ['FIREBASE_PRIVATE_KEY_PATH']],
    [
      'both old variables',
      { FIREBASE_SERVICE_ACCOUNT_JSON: OTHER_PROJECT_KEY, FIREBASE_PRIVATE_KEY_PATH: missingPath },
      ['FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_PRIVATE_KEY_PATH'],
    ],
  ])('uses keyless credentials over %s, warning once by variable name', (_label, env, names) => {
    const result = load({ NODE_ENV: 'development', FIREBASE_PROJECT_ID: PROJECT_ID, ...env });

    expectKeyless(result);
    expect(warnings()).toHaveLength(1);
    for (const name of names) expect(warnings()[0].text).toContain(name);
    expectNoMarkers(result);
  });

  it('does not warn when only FIREBASE_PROJECT_ID is set', () => {
    const result = load({ NODE_ENV: 'development', FIREBASE_PROJECT_ID: PROJECT_ID });

    expectKeyless(result);
    expect(warnings()).toEqual([]);
  });
});

describe('IDENTITY-016: production refuses a conflict', () => {
  it.each([
    ['FIREBASE_SERVICE_ACCOUNT_JSON', { FIREBASE_SERVICE_ACCOUNT_JSON: OTHER_PROJECT_KEY }],
    ['FIREBASE_SERVICE_ACCOUNT_JSON (unparseable)', { FIREBASE_SERVICE_ACCOUNT_JSON: BAD_JSON }],
    ['FIREBASE_PRIVATE_KEY_PATH', { FIREBASE_PRIVATE_KEY_PATH: missingPath }],
  ])('throws when FIREBASE_PROJECT_ID and %s are both set', (label, env) => {
    const result = load({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: PROJECT_ID, ...env });

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toContain(label.split(' ')[0]);
    expect(admin.initializeApp).not.toHaveBeenCalled();
    expectNoMarkers(result);
  });

  it('starts keyless when only FIREBASE_PROJECT_ID is set', () => {
    const result = load({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: PROJECT_ID });

    expectKeyless(result);
    expect(warnings()).toEqual([]);
  });
});

const FAILURES = [
  ['nothing is set', {}],
  ['FIREBASE_SERVICE_ACCOUNT_JSON is not JSON', { FIREBASE_SERVICE_ACCOUNT_JSON: BAD_JSON }],
  ['the FIREBASE_PRIVATE_KEY_PATH file is missing', { FIREBASE_PRIVATE_KEY_PATH: missingPath }],
  ['the service account is not a usable credential', { FIREBASE_SERVICE_ACCOUNT_JSON: UNUSABLE_KEY }],
];

describe('IDENTITY-016: a start-up failure', () => {
  it.each(FAILURES)('stops production start-up when %s', (_label, env) => {
    const result = load({ NODE_ENV: 'production', ...env });

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toMatch(/^Firebase Admin is not configured/);
    expect(admin.initializeApp).not.toHaveBeenCalled();
    expectNoMarkers(result);
  });

  it.each(FAILURES)('exports null with one warning in development when %s', (_label, env) => {
    const result = load({ NODE_ENV: 'development', ...env });

    expect(result.error).toBeUndefined();
    expect(result.exported).toBeNull();
    expect(admin.initializeApp).not.toHaveBeenCalled();
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0].text).toContain('Firebase Admin is not configured');
    expectNoMarkers(result);
  });

  it('does not quote an unreadable FIREBASE_PRIVATE_KEY_PATH file', () => {
    const file = writeKeyFile(`${MARKERS[4]} not json`);

    const production = load({ NODE_ENV: 'production', FIREBASE_PRIVATE_KEY_PATH: file });
    expect(production.error).toBeInstanceOf(Error);
    expectNoMarkers(production);

    const development = load({ NODE_ENV: 'development', FIREBASE_PRIVATE_KEY_PATH: file });
    expect(development.exported).toBeNull();
    expectNoMarkers(development);
  });
});

describe('IDENTITY-016: a service account alone still works', () => {
  const ACCOUNT = {
    type: 'service_account',
    project_id: 'synthetic-project',
    private_key: '-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----\n',
    client_email: 'synthetic@synthetic-project.example.test',
  };

  it.each(['development', 'production'])('from FIREBASE_SERVICE_ACCOUNT_JSON in %s', (nodeEnv) => {
    const result = load({ NODE_ENV: nodeEnv, FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(ACCOUNT) });

    expect(result.error).toBeUndefined();
    expect(result.exported).toBe(admin);
    expect(admin.credential.cert).toHaveBeenCalledWith(ACCOUNT);
    expect(admin.credential.applicationDefault).not.toHaveBeenCalled();
    expect(admin.initializeApp).toHaveBeenCalledWith({ credential: { kind: 'cert', projectId: 'synthetic-project' } });
    expect(warnings()).toEqual([]);
  });

  it.each(['development', 'production'])('from a FIREBASE_PRIVATE_KEY_PATH file in %s', (nodeEnv) => {
    const file = writeKeyFile(JSON.stringify(ACCOUNT));

    const result = load({ NODE_ENV: nodeEnv, FIREBASE_PRIVATE_KEY_PATH: file });

    expect(result.exported).toBe(admin);
    expect(admin.credential.cert).toHaveBeenCalledWith(ACCOUNT);
    expect(admin.initializeApp).toHaveBeenCalledWith({ credential: { kind: 'cert', projectId: 'synthetic-project' } });
  });
});
