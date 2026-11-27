// PLATFORM-018 and PLATFORM-002: server.js start-up order and graceful
// shutdown. The app is a loopback HTTP server whose requests the test releases;
// the pool, Redis, Sentry, signal handlers and process.exit are fakes.
const http = require('node:http');

const mockOrder = [];
const mockPool = { end: jest.fn() };
const mockRedis = { isReady: true, isOpen: true, quit: jest.fn(), disconnect: jest.fn() };
const mockSentry = { close: jest.fn() };
const mockState = { sentryEnabled: false, redis: null, server: null, held: [], onRequest: null };

jest.mock('../observability/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../config/db', () => mockPool);
jest.mock('../config/redis', () => ({ getRedisClient: () => mockState.redis }));
jest.mock('../observability/sentry', () => ({
  Sentry: mockSentry,
  initSentry: () => {
    mockOrder.push('initSentry');
    return mockState.sentryEnabled;
  },
}));
jest.mock('../app', () => {
  mockOrder.push('app loaded');
  return {
    createApp: (options) => {
      mockOrder.push(['createApp', options]);
      return {
        // Ignores PORT and serves on loopback; requests wait for the test to end them.
        listen: (_port, callback) => {
          const server = require('node:http').createServer((req, res) => {
            mockState.held.push(res);
            mockState.onRequest?.();
          });
          mockState.server = server;
          server.listen(0, '127.0.0.1', callback);
          return server;
        },
      };
    },
  };
});

const logger = require('../observability/logger');

let signalHandlers = {};
const exitCalls = [];
const savedTimeout = process.env.SHUTDOWN_TIMEOUT_MS;
const realExit = process.exit;
const realOnce = process.once;

// Plain replacements rather than jest.spyOn, so restoreMocks cannot put the
// real process.exit back while a server from an earlier test is closing.
beforeAll(() => {
  process.exit = (code) => { exitCalls.push(code); };
  process.once = (event, handler) => {
    signalHandlers[event] = handler;
    return process;
  };
});

afterAll(() => {
  process.exit = realExit;
  process.once = realOnce;
});

beforeEach(() => {
  mockOrder.length = 0;
  mockState.sentryEnabled = false;
  mockState.redis = Object.assign(mockRedis, { isReady: true, isOpen: true });
  mockState.server = null;
  mockState.held = [];
  mockState.onRequest = null;
  mockPool.end.mockResolvedValue(undefined);
  mockRedis.quit.mockResolvedValue('OK');
  mockRedis.disconnect.mockResolvedValue(undefined);
  mockSentry.close.mockResolvedValue(true);
  delete process.env.SHUTDOWN_TIMEOUT_MS;

  for (const event of Object.keys(signalHandlers)) delete signalHandlers[event];
  exitCalls.length = 0;
});

afterEach(async () => {
  jest.useRealTimers();
  for (const res of mockState.held) if (!res.writableEnded) res.end();
  const { server } = mockState;
  if (server) {
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(() => resolve()));
  }
  // Let a pending shutdown callback finish before the next test starts.
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (savedTimeout === undefined) delete process.env.SHUTDOWN_TIMEOUT_MS;
  else process.env.SHUTDOWN_TIMEOUT_MS = savedTimeout;
});

async function startServer() {
  jest.isolateModules(() => {
    require('../server');
  });
  const { server } = mockState;
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
  return server;
}

function get(target, { agent = false } = {}) {
  const port = typeof target === 'number' ? target : target.address().port;
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/slow', agent }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
  });
}

function requestReceived() {
  return new Promise((resolve) => { mockState.onRequest = resolve; });
}

async function waitFor(condition, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for a condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const exitCodes = () => [...exitCalls];

test('registers SIGTERM and SIGINT handlers', async () => {
  await startServer();
  expect(Object.keys(signalHandlers).sort()).toEqual(['SIGINT', 'SIGTERM']);
});

test('starts Sentry before the Express app is loaded and passes on whether it is enabled', async () => {
  mockState.sentryEnabled = true;
  await startServer();
  expect(mockOrder).toEqual(['initSentry', 'app loaded', ['createApp', { sentryEnabled: true }]]);
});

test('SIGTERM lets an in-flight request finish, refuses new connections, closes the pool and Redis, then exits 0', async () => {
  const server = await startServer();
  const { port } = server.address();
  const received = requestReceived();
  const inFlight = get(port);
  await received;

  signalHandlers.SIGTERM();
  expect(logger.info).toHaveBeenCalledWith({ signal: 'SIGTERM', timeoutMs: 8000 }, 'Shutting down');

  await expect(get(port)).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  expect(exitCalls).toEqual([]);
  expect(mockPool.end).not.toHaveBeenCalled();

  mockState.held[0].end('synthetic response');
  await expect(inFlight).resolves.toEqual({ status: 200, text: 'synthetic response' });

  await waitFor(() => exitCalls.length > 0);
  expect(exitCodes()).toEqual([0]);
  expect(mockPool.end).toHaveBeenCalledTimes(1);
  expect(mockRedis.quit).toHaveBeenCalledTimes(1);
  expect(mockRedis.disconnect).not.toHaveBeenCalled();
  expect(mockSentry.close).not.toHaveBeenCalled();
  expect(logger.info).toHaveBeenCalledWith('Shutdown complete');
});

test('SIGINT shuts down the same way and flushes Sentry when it is enabled', async () => {
  mockState.sentryEnabled = true;
  mockState.redis.isReady = false;
  await startServer();

  signalHandlers.SIGINT();
  await waitFor(() => exitCalls.length > 0);

  expect(exitCodes()).toEqual([0]);
  expect(mockPool.end).toHaveBeenCalledTimes(1);
  expect(mockRedis.quit).not.toHaveBeenCalled();
  expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
  expect(mockSentry.close).toHaveBeenCalledWith(2000);
});

test('works without a Redis client', async () => {
  mockState.redis = null;
  await startServer();
  signalHandlers.SIGTERM();
  await waitFor(() => exitCalls.length > 0);
  expect(exitCodes()).toEqual([0]);
  expect(mockPool.end).toHaveBeenCalledTimes(1);
});

test('an idle keep-alive connection does not hold shutdown', async () => {
  const server = await startServer();
  const agent = new http.Agent({ keepAlive: true });
  try {
    const received = requestReceived();
    const done = get(server, { agent });
    await received;
    mockState.held[0].end('ok');
    await done;

    signalHandlers.SIGTERM();
    await waitFor(() => exitCalls.length > 0, 1000);
    expect(exitCodes()).toEqual([0]);
  } finally {
    agent.destroy();
  }
});

test('a dependency that fails to close is logged and the process still exits 0', async () => {
  mockPool.end.mockRejectedValue(new Error('synthetic pool close failure'));
  await startServer();

  signalHandlers.SIGTERM();
  await waitFor(() => exitCalls.length > 0);

  expect(exitCodes()).toEqual([0]);
  expect(mockRedis.quit).toHaveBeenCalledTimes(1);
  expect(logger.warn).toHaveBeenCalledWith(
    expect.objectContaining({ err: expect.any(Error) }),
    'Shutdown: closing a dependency failed',
  );
});

test('a second signal is ignored', async () => {
  await startServer();
  signalHandlers.SIGTERM();
  signalHandlers.SIGINT();
  await waitFor(() => exitCalls.length > 0);
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(logger.info.mock.calls.filter(([, message]) => message === 'Shutting down')).toHaveLength(1);
  expect(exitCodes()).toEqual([0]);
  expect(mockPool.end).toHaveBeenCalledTimes(1);
});

test('past SHUTDOWN_TIMEOUT_MS with a request still open it exits 1', async () => {
  process.env.SHUTDOWN_TIMEOUT_MS = '250';
  const server = await startServer();
  const received = requestReceived();
  const inFlight = get(server).catch(() => null);
  await received;

  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  signalHandlers.SIGTERM();
  expect(logger.info).toHaveBeenCalledWith({ signal: 'SIGTERM', timeoutMs: 250 }, 'Shutting down');

  jest.advanceTimersByTime(249);
  expect(exitCalls).toEqual([]);
  jest.advanceTimersByTime(1);

  expect(exitCodes()).toEqual([1]);
  expect(logger.error).toHaveBeenCalledWith({ timeoutMs: 250 }, 'Shutdown timed out; exiting with requests still open');
  expect(mockPool.end).not.toHaveBeenCalled();

  jest.useRealTimers();
  mockState.held[0].end();
  await inFlight;
});

test.each(['abc', '0', '-5', '1.5'])('SHUTDOWN_TIMEOUT_MS=%p stops startup before listening', (value) => {
  process.env.SHUTDOWN_TIMEOUT_MS = value;
  expect(() => jest.isolateModules(() => require('../server')))
    .toThrow('Invalid SHUTDOWN_TIMEOUT_MS: must be a positive integer.');
  expect(mockState.server).toBeNull();
  expect(signalHandlers).toEqual({});
});
