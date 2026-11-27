// BILLING-008, DOCUMENTS-010: the monthly generation limit is a reservation.
// enforceUsage counts and inserts one ai_usage row in a single transaction
// under pg_advisory_xact_lock, the controllers confirm it once the document is
// stored, and failures (controller errors, later 4xx/5xx responses) release it.
//
// Everything is synthetic. The fake pool keeps ai_usage in memory, applies
// inserts only on COMMIT, and models the advisory lock as a per-key mutex held
// until COMMIT/ROLLBACK, so it can show whether concurrent requests race.
jest.mock('../config/db', () => mockCreateUsagePool());
jest.mock('../observability/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
}));
jest.mock('../services/aiService', () => ({
  generateResumeText: jest.fn(),
  generateCoverLetter: jest.fn(),
  rewriteDocumentText: jest.fn(),
}));
jest.mock('../modules/documents/services/resumeService', () => ({ createResume: jest.fn() }));
jest.mock('../modules/documents/services/coverLetterService', () => ({ createCoverLetter: jest.fn() }));
jest.mock('../templates/utils/pdfGenerator', () => ({ generatePDF: jest.fn(), renderHTML: jest.fn() }));

const { EventEmitter } = require('node:events');
const express = require('express');
const pool = require('../config/db');
const logger = require('../observability/logger');
const aiService = require('../services/aiService');
const resumeService = require('../modules/documents/services/resumeService');
const coverLetterService = require('../modules/documents/services/coverLetterService');
const subscriptionRepository = require('../modules/billing/repositories/subscriptionRepository');
const subscriptionService = require('../services/subscriptionService');
const enforceUsage = require('../middleware/enforceUsage');
const errorHandler = require('../middleware/errorMiddleware');
const { createResumeWithAI } = require('../controllers/resumeController');
const { createCoverLetterWithAI } = require('../controllers/coverLetterController');
const { startServer } = require('./support/adminHarness');

const USER_ID = 41;
const LIMIT_MESSAGE = 'Monthly limit reached. Upgrade your plan.';

function mockCreateUsagePool() {
  const yieldTurns = async (n) => {
    for (let i = 0; i < n; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };

  const state = {};
  const pool = { state };

  pool.reset = () => {
    Object.assign(state, {
      rows: [],
      nextId: 1,
      plan: { monthly_resume_limit: 1, monthly_cover_letter_limit: 1 },
      lockEnabled: true,
      locks: new Map(),
      log: [],
      failures: [],
      clientsOpened: 0,
      clientsReleased: 0,
      releasedInsideTransaction: 0,
    });
  };

  // failOn(/INSERT/, error) makes the next matching statement reject.
  pool.failOn = (pattern, error) => state.failures.push({ pattern, error });
  pool.statements = () => state.log.map((entry) => entry.sql.trim().split(/\s+/).slice(0, 2).join(' '));
  pool.callsMatching = (pattern) => state.log.filter((entry) => pattern.test(entry.sql));

  function takeFailure(sql) {
    const index = state.failures.findIndex(({ pattern }) => pattern.test(sql));
    if (index === -1) return null;
    return state.failures.splice(index, 1)[0].error;
  }

  async function acquire(key) {
    while (state.locks.has(key)) await state.locks.get(key).released;
    let open;
    const released = new Promise((resolve) => { open = resolve; });
    state.locks.set(key, { released, open });
  }

  function releaseLocks(held) {
    for (const key of held.splice(0)) {
      const entry = state.locks.get(key);
      state.locks.delete(key);
      entry.open();
    }
  }

  pool.query = async (sql, params = []) => {
    state.log.push({ sql, params, client: null });
    const failure = takeFailure(sql);
    if (failure) throw failure;
    if (/FROM subscriptions/.test(sql)) return { rows: state.plan ? [state.plan] : [] };
    if (/DELETE FROM ai_usage/.test(sql)) {
      const before = state.rows.length;
      state.rows = state.rows.filter((row) => row.id !== params[0]);
      return { rowCount: before - state.rows.length };
    }
    if (/INSERT INTO ai_usage/.test(sql)) {
      const row = { id: state.nextId++, user_id: params[0], type: params[1] };
      state.rows.push(row);
      return { rows: [] };
    }
    throw new Error(`unexpected pool.query: ${sql}`);
  };

  pool.connect = async () => {
    state.clientsOpened += 1;
    const clientId = state.clientsOpened;
    const held = [];
    let inTransaction = false;
    let pending = [];

    return {
      async query(sql, params = []) {
        state.log.push({ sql, params, client: clientId });
        const failure = takeFailure(sql);
        if (failure) throw failure;
        const command = sql.trim().toUpperCase();
        if (command === 'BEGIN') {
          inTransaction = true;
          return { rows: [] };
        }
        if (command === 'COMMIT' || command === 'ROLLBACK') {
          if (command === 'COMMIT') state.rows.push(...pending);
          pending = [];
          inTransaction = false;
          releaseLocks(held);
          return { rows: [] };
        }
        if (/pg_advisory_xact_lock/.test(sql)) {
          if (state.lockEnabled) {
            const key = params.join(':');
            await acquire(key);
            held.push(key);
          }
          return { rows: [{ pg_advisory_xact_lock: '' }] };
        }
        if (/SELECT COUNT\(\*\)[\s\S]*FROM ai_usage/.test(sql)) {
          const count = state.rows.filter((row) => row.user_id === params[0] && row.type === params[1]).length;
          // Give every other request a chance to reach this point first.
          await yieldTurns(5);
          return { rows: [{ count: String(count) }] };
        }
        if (/INSERT INTO ai_usage[\s\S]*RETURNING id/.test(sql)) {
          const row = { id: state.nextId++, user_id: params[0], type: params[1] };
          pending.push(row);
          return { rows: [{ id: row.id }] };
        }
        throw new Error(`unexpected client.query: ${sql}`);
      },
      release() {
        state.clientsReleased += 1;
        if (inTransaction) state.releasedInsideTransaction += 1;
        // A real connection ends its transaction (and xact locks) when closed.
        releaseLocks(held);
      },
    };
  }

  pool.reset();
  return pool;
}

const resumeBody = { personal: { fullName: 'Test Person', email: 'person@example.test' }, style: 'modern' };
const coverLetterBody = { personal: { fullName: 'Test Person' }, job: { company: 'Example Co', position: 'Engineer' } };

const flows = [
  {
    type: 'resume',
    path: '/resume',
    body: resumeBody,
    planKey: 'monthly_resume_limit',
    ai: () => aiService.generateResumeText,
    store: () => resumeService.createResume,
  },
  {
    type: 'cover_letter',
    path: '/cover-letter',
    body: coverLetterBody,
    planKey: 'monthly_cover_letter_limit',
    ai: () => aiService.generateCoverLetter,
    store: () => coverLetterService.createCoverLetter,
  },
];

// Later middleware behaviour for the next request, mirroring the routes where
// template access, rate limiting and payload checks run after enforceUsage.
let afterUsage;

function buildApp() {
  const app = express();
  app.use(express.json());
  const authenticate = (req, res, next) => {
    req.user = { id: USER_ID };
    next();
  };
  const later = (req, res, next) => afterUsage(req, res, next);
  app.post('/resume', authenticate, enforceUsage('resume'), later, createResumeWithAI);
  app.post('/cover-letter', authenticate, enforceUsage('cover_letter'), later, createCoverLetterWithAI);
  app.use(errorHandler);
  return app;
}

let server;

beforeAll(async () => {
  server = await startServer(buildApp());
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  pool.reset();
  afterUsage = (req, res, next) => next();
  aiService.generateResumeText.mockImplementation(async () => ({ summary: 'Generated summary' }));
  aiService.generateCoverLetter.mockImplementation(async () => ({ body: 'Generated letter' }));
  let documents = 0;
  resumeService.createResume.mockImplementation(async () => ({ id: `resume-${++documents}` }));
  coverLetterService.createCoverLetter.mockImplementation(async () => ({ id: `letter-${++documents}` }));
});

function usageRows(type) {
  return pool.state.rows.filter((row) => row.user_id === USER_ID && (!type || row.type === type));
}

const post = (flow) => server.request('POST', flow.path, { body: JSON.stringify(flow.body) });

describe('subscriptionRepository.reserveUsage', () => {
  it('locks per user and type, counts, inserts and commits on one client', async () => {
    const id = await subscriptionRepository.reserveUsage(USER_ID, 'resume', 3);

    expect(id).toBe(1);
    expect(pool.statements()).toEqual(['BEGIN', 'SELECT pg_advisory_xact_lock(hashtext(\'ai_usage\'),', 'SELECT COUNT(*)', 'INSERT INTO', 'COMMIT']);
    expect(new Set(pool.state.log.map((entry) => entry.client))).toEqual(new Set([1]));
    const [lock] = pool.callsMatching(/pg_advisory_xact_lock/);
    expect(lock.params).toEqual([USER_ID, 'resume']);
    const [count] = pool.callsMatching(/COUNT/);
    expect(count.sql).toMatch(/date_trunc\('month', CURRENT_DATE\)/);
    expect(count.params).toEqual([USER_ID, 'resume']);
    expect(usageRows('resume')).toHaveLength(1);
    expect(pool.state.clientsReleased).toBe(1);
    expect(pool.state.releasedInsideTransaction).toBe(0);
  });

  it('returns null, rolls back and releases the client when the limit is reached', async () => {
    pool.state.rows.push({ id: 99, user_id: USER_ID, type: 'resume' });

    await expect(subscriptionRepository.reserveUsage(USER_ID, 'resume', 1)).resolves.toBeNull();

    expect(pool.statements()).toEqual(['BEGIN', 'SELECT pg_advisory_xact_lock(hashtext(\'ai_usage\'),', 'SELECT COUNT(*)', 'ROLLBACK']);
    expect(usageRows('resume')).toHaveLength(1);
    expect(pool.state.clientsReleased).toBe(1);
    expect(pool.state.locks.size).toBe(0);
  });

  it('skips the count and inserts when the limit is null (unlimited)', async () => {
    pool.state.rows.push({ id: 99, user_id: USER_ID, type: 'resume' });

    await expect(subscriptionRepository.reserveUsage(USER_ID, 'resume', null)).resolves.toBe(1);

    expect(pool.callsMatching(/COUNT/)).toEqual([]);
    expect(pool.statements()).toEqual(['BEGIN', 'SELECT pg_advisory_xact_lock(hashtext(\'ai_usage\'),', 'INSERT INTO', 'COMMIT']);
    expect(usageRows('resume')).toHaveLength(2);
  });

  it('rolls back, releases the client and rethrows the original error', async () => {
    const original = new Error('synthetic insert failure');
    pool.failOn(/INSERT INTO ai_usage/, original);

    await expect(subscriptionRepository.reserveUsage(USER_ID, 'resume', 5)).rejects.toBe(original);

    expect(pool.statements().at(-1)).toBe('ROLLBACK');
    expect(pool.callsMatching(/COMMIT/)).toEqual([]);
    expect(usageRows()).toHaveLength(0);
    expect(pool.state.clientsReleased).toBe(1);
    expect(pool.state.locks.size).toBe(0);
  });

  it('still rethrows the original error when ROLLBACK also fails', async () => {
    const original = new Error('synthetic lock failure');
    pool.failOn(/pg_advisory_xact_lock/, original);
    pool.failOn(/^ROLLBACK/, new Error('synthetic rollback failure'));

    await expect(subscriptionRepository.reserveUsage(USER_ID, 'resume', 5)).rejects.toBe(original);
    expect(pool.state.clientsReleased).toBe(1);
  });
});

describe('concurrent reservations at the limit', () => {
  const N = 5;
  const reserveMany = (type) => Promise.all(
    Array.from({ length: N }, () => subscriptionService.reserveUsage(USER_ID, type))
  );

  it('allows exactly one of N parallel reservations with limit 1', async () => {
    const results = await reserveMany('resume');

    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    expect(results.filter((r) => !r.allowed).every((r) => r.reservationId === null)).toBe(true);
    expect(usageRows('resume')).toHaveLength(1);
    expect(pool.state.clientsReleased).toBe(N);
    expect(pool.state.locks.size).toBe(0);
  });

  it('control: without the advisory lock the same requests race past the limit', async () => {
    pool.state.lockEnabled = false;

    const results = await reserveMany('resume');

    // Proves the scenario above would detect a missing or ineffective lock.
    expect(results.filter((r) => r.allowed).length).toBeGreaterThan(1);
    expect(usageRows('resume').length).toBeGreaterThan(1);
  });

  it('keeps the limit per type: a resume reservation does not block a cover letter', async () => {
    await subscriptionService.reserveUsage(USER_ID, 'resume');

    await expect(subscriptionService.reserveUsage(USER_ID, 'cover_letter')).resolves.toMatchObject({ allowed: true });
    await expect(subscriptionService.reserveUsage(USER_ID, 'resume')).resolves.toMatchObject({ allowed: false });
  });

  it('allows every parallel reservation on an unlimited plan, without counting', async () => {
    pool.state.plan.monthly_resume_limit = null;

    const results = await reserveMany('resume');

    expect(results.every((r) => r.allowed)).toBe(true);
    expect(new Set(results.map((r) => r.reservationId)).size).toBe(N);
    expect(usageRows('resume')).toHaveLength(N);
    expect(pool.callsMatching(/COUNT/)).toEqual([]);
  });

  it('throws when the user has no active subscription, without opening a transaction', async () => {
    pool.state.plan = null;

    await expect(subscriptionService.reserveUsage(USER_ID, 'resume')).rejects.toThrow('No active subscription found.');
    expect(pool.state.clientsOpened).toBe(0);
  });

  it.each(flows)('$type: N parallel HTTP requests with limit 1 produce one 201 and one usage row', async (flow) => {
    const responses = await Promise.all(Array.from({ length: N }, () => post(flow)));
    const statuses = responses.map((r) => r.status).sort();

    expect(statuses).toEqual([201, 403, 403, 403, 403]);
    expect(usageRows(flow.type)).toHaveLength(1);
    expect(flow.ai()).toHaveBeenCalledTimes(1);
    expect(flow.store()).toHaveBeenCalledTimes(1);
  });

  it.each(flows)('$type: all parallel HTTP requests succeed on an unlimited plan', async (flow) => {
    pool.state.plan[flow.planKey] = null;

    const responses = await Promise.all(Array.from({ length: N }, () => post(flow)));

    expect(responses.map((r) => r.status)).toEqual(Array(N).fill(201));
    expect(usageRows(flow.type)).toHaveLength(N);
    expect(pool.callsMatching(/COUNT/)).toEqual([]);
  });
});

describe.each(flows)('$type generation releases the reservation on failure', (flow) => {
  it('confirms and keeps the row when the document is stored', async () => {
    const res = await post(flow);

    expect(res.status).toBe(201);
    expect(usageRows(flow.type)).toHaveLength(1);
    expect(pool.callsMatching(/DELETE FROM ai_usage/)).toEqual([]);
  });

  it('releases when the AI call throws, and a retry succeeds', async () => {
    flow.ai().mockImplementationOnce(async () => { throw new Error('synthetic AI outage'); });

    const failed = await post(flow);
    expect(failed.status).toBe(500);
    expect(usageRows(flow.type)).toHaveLength(0);
    expect(flow.store()).not.toHaveBeenCalled();
    // The controller and the finish listener both see the failure; only one DELETE runs.
    expect(pool.callsMatching(/DELETE FROM ai_usage/)).toHaveLength(1);

    const retry = await post(flow);
    expect(retry.status).toBe(201);
    expect(usageRows(flow.type)).toHaveLength(1);
  });

  it('releases when storing the document fails, and a retry succeeds', async () => {
    flow.store().mockImplementationOnce(async () => { throw new Error('synthetic storage failure'); });

    const failed = await post(flow);
    expect(failed.status).toBe(500);
    expect(usageRows(flow.type)).toHaveLength(0);

    const retry = await post(flow);
    expect(retry.status).toBe(201);
    expect(usageRows(flow.type)).toHaveLength(1);
  });

  it('releases when later middleware rejects with 429', async () => {
    afterUsage = (req, res) => res.status(429).json({ error: 'Too many requests' });

    const res = await post(flow);

    expect(res.status).toBe(429);
    expect(flow.ai()).not.toHaveBeenCalled();
    expect(usageRows(flow.type)).toHaveLength(0);

    afterUsage = (req, res, next) => next();
    expect((await post(flow)).status).toBe(201);
  });

  it('releases on the 500 error path when later middleware passes an error', async () => {
    afterUsage = (req, res, next) => next(new Error('synthetic middleware failure'));

    const res = await post(flow);

    expect(res.status).toBe(500);
    expect(res.json()).toMatchObject({ message: 'Internal server error' });
    expect(usageRows(flow.type)).toHaveLength(0);
  });

  it('returns 403 with the existing message at the limit, rolling back and releasing the client', async () => {
    pool.state.rows.push({ id: 99, user_id: USER_ID, type: flow.type });

    const res = await post(flow);

    expect(res.status).toBe(403);
    expect(res.json()).toEqual({ error: LIMIT_MESSAGE });
    expect(pool.statements().at(-1)).toBe('ROLLBACK');
    expect(pool.callsMatching(/RETURNING id/)).toEqual([]);
    expect(pool.state.clientsReleased).toBe(pool.state.clientsOpened);
    expect(flow.ai()).not.toHaveBeenCalled();
    expect(usageRows(flow.type)).toHaveLength(1);
    // The 403 is sent by enforceUsage itself; it must not delete an existing row.
    expect(pool.callsMatching(/DELETE FROM ai_usage/)).toEqual([]);
  });
});

describe('req.usageReservation', () => {
  function fakeRes() {
    const res = new EventEmitter();
    res.statusCode = 200;
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn(() => res);
    return res;
  }

  async function reserve(type = 'resume') {
    const req = { user: { id: USER_ID } };
    const res = fakeRes();
    const next = jest.fn();
    await enforceUsage(type)(req, res, next);
    expect(next).toHaveBeenCalledWith();
    return { req, res };
  }

  const deletes = () => pool.callsMatching(/DELETE FROM ai_usage/);
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('exposes the reserved row id and type', async () => {
    const { req } = await reserve('cover_letter');

    expect(req.usageReservation).toMatchObject({ id: 1, type: 'cover_letter' });
    expect(usageRows('cover_letter')).toHaveLength(1);
  });

  it('is not released by a later error status once confirmed', async () => {
    const { req, res } = await reserve();

    req.usageReservation.confirm();
    res.statusCode = 500;
    res.emit('finish');
    await flush();

    expect(deletes()).toEqual([]);
    expect(usageRows('resume')).toHaveLength(1);
  });

  it('is kept when the response succeeds', async () => {
    const { req, res } = await reserve();

    req.usageReservation.confirm();
    res.statusCode = 201;
    res.emit('finish');
    await flush();

    expect(usageRows('resume')).toHaveLength(1);
  });

  it('is released by an error status when still open', async () => {
    const { res } = await reserve();

    res.statusCode = 400;
    res.emit('finish');
    await flush();

    expect(deletes()).toHaveLength(1);
    expect(usageRows('resume')).toHaveLength(0);
  });

  it('makes confirm() and release() safe to call twice', async () => {
    const first = await reserve();
    await first.req.usageReservation.release();
    await first.req.usageReservation.release();
    first.req.usageReservation.confirm();
    expect(deletes()).toHaveLength(1);

    const second = await reserve();
    second.req.usageReservation.confirm();
    second.req.usageReservation.confirm();
    await second.req.usageReservation.release();
    expect(deletes()).toHaveLength(1);
    expect(usageRows('resume')).toHaveLength(1);
  });

  it('logs a failed release DELETE instead of throwing', async () => {
    const { req } = await reserve();
    const failure = new Error('synthetic delete failure');
    pool.failOn(/DELETE FROM ai_usage/, failure);

    await expect(req.usageReservation.release()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: failure, userId: USER_ID, type: 'resume' }),
      'Failed to release usage reservation'
    );
  });

  it('does not produce an unhandled rejection when the finish-time release fails', async () => {
    const { res } = await reserve();
    pool.failOn(/DELETE FROM ai_usage/, new Error('synthetic delete failure'));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      res.statusCode = 503;
      res.emit('finish');
      await flush();
      await flush();
    } finally {
      process.off('unhandledRejection', unhandled);
    }

    expect(unhandled).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.anything(), 'Failed to release usage reservation');
  });

  it('passes repository errors to next() without setting a reservation', async () => {
    const failure = new Error('synthetic connect failure');
    pool.failOn(/^BEGIN/, failure);
    const req = { user: { id: USER_ID } };
    const next = jest.fn();

    await enforceUsage('resume')(req, fakeRes(), next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(req.usageReservation).toBeUndefined();
    expect(pool.state.clientsReleased).toBe(1);
  });
});

describe.each([
  { type: 'resume', handler: createResumeWithAI, body: resumeBody, ai: () => aiService.generateResumeText },
  { type: 'cover_letter', handler: createCoverLetterWithAI, body: coverLetterBody, ai: () => aiService.generateCoverLetter },
])('$type controller without req.usageReservation', ({ type, handler, body, ai }) => {
  function fakeRes() {
    const res = { statusCode: 200 };
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn(() => res);
    return res;
  }

  it('falls back to trackUsage after storing the document', async () => {
    const res = fakeRes();
    const next = jest.fn();

    await handler({ user: { id: USER_ID }, body }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    const inserts = pool.callsMatching(/INSERT INTO ai_usage/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ client: null, params: [USER_ID, type] });
    expect(inserts[0].sql).not.toMatch(/RETURNING/);
    expect(pool.state.clientsOpened).toBe(0);
  });

  it('records no usage and passes the error on when generation fails', async () => {
    const failure = new Error('synthetic AI outage');
    ai().mockImplementationOnce(async () => { throw failure; });
    const next = jest.fn();

    await handler({ user: { id: USER_ID }, body }, fakeRes(), next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(pool.callsMatching(/ai_usage/)).toEqual([]);
  });
});
