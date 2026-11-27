// PLATFORM-006, PLATFORM-023, ADMIN-015: which errors choose the client status,
// what the client is told and the level they are logged at. The app here is a
// bare Express app with the real error handler; every error is synthetic.
const http = require('node:http');
const express = require('express');

jest.mock('../observability/logger', () => ({
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
}));

const PROVIDER_MESSAGE = 'synthetic-provider-message: key sk-synthetic is over quota';
const UPSTREAM_MESSAGE = 'A service we depend on failed. Please try again later.';

// SDK errors are subclasses that carry the provider's status, like openai,
// stripe and firebase-admin errors do.
class OpenAILikeAPIError extends Error {
  constructor(status) {
    super(PROVIDER_MESSAGE);
    this.status = status;
    this.code = 'insufficient_quota';
    this.error = { message: PROVIDER_MESSAGE };
  }
}

class StripeLikeError extends Error {
  constructor(statusCode) {
    super(PROVIDER_MESSAGE);
    this.type = 'StripeCardError';
    this.statusCode = statusCode;
    this.raw = { message: PROVIDER_MESSAGE };
  }
}

class GenericSdkError extends Error {
  constructor(status) {
    super(PROVIDER_MESSAGE);
    this.status = status;
  }
}

// Loads the handler with NODE_ENV fixed, since it reads it once at load.
function loadHandler(nodeEnv) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  let loaded;
  try {
    jest.isolateModules(() => {
      loaded = {
        errorHandler: require('../middleware/errorMiddleware'),
        logger: require('../observability/logger'),
      };
    });
  } finally {
    process.env.NODE_ENV = previous;
  }
  return loaded;
}

function buildApp(errorHandler, { afterHandler } = {}) {
  const app = express();
  app.use(express.json());
  app.get('/throw/:kind', (req, res, next) => next(errors[req.params.kind]()));
  app.post('/echo', (req, res) => res.json({ ok: true }));
  app.get('/param/:id', (req, res) => res.json({ id: req.params.id }));
  app.get('/partial', (req, res, next) => {
    res.status(200);
    res.write('partial-body');
    next(new Error('synthetic failure after headers'));
  });
  app.use(errorHandler);
  if (afterHandler) app.use(afterHandler);
  return app;
}

const errors = {
  own400: () => Object.assign(new Error('Resume title is required.'), { statusCode: 400 }),
  own404: () => Object.assign(new Error('Resume not found.'), { statusCode: 404 }),
  own409: () => Object.assign(new Error('Email already in use.'), { status: 409 }),
  plain: () => new Error('synthetic-internal-detail'),
  openai401: () => new OpenAILikeAPIError(401),
  openai429: () => new OpenAILikeAPIError(429),
  stripe402: () => new StripeLikeError(402),
  stripe401: () => new StripeLikeError(401),
  sdk429: () => new GenericSdkError(429),
  sdk401: () => new GenericSdkError(401),
};

async function serve(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    // Resolves for complete and for aborted responses.
    request(method, path, { headers = {}, body } = {}) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port: server.address().port,
          method,
          path,
          agent: false,
          headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
        }, (res) => {
          let text = '';
          let settled = false;
          const finish = (aborted) => {
            if (settled) return;
            settled = true;
            resolve({ status: res.statusCode, headers: res.headers, text, aborted });
          };
          res.setEncoding('utf8');
          res.on('data', (chunk) => { text += chunk; });
          res.on('end', () => finish(!res.complete));
          res.on('aborted', () => finish(true));
          res.on('error', () => finish(true));
          res.on('close', () => finish(!res.complete));
        });
        req.on('error', reject);
        req.end(body);
      });
    },
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

const environments = [['development', 'development'], ['production', 'production']];

describe.each(environments)('in %s', (_label, nodeEnv) => {
  let server;
  let logger;

  beforeAll(async () => {
    const loaded = loadHandler(nodeEnv);
    logger = loaded.logger;
    server = await serve(buildApp(loaded.errorHandler));
  });

  afterAll(() => server.close());

  test.each([
    ['own400', 400, 'Resume title is required.'],
    ['own404', 404, 'Resume not found.'],
    ['own409', 409, 'Email already in use.'],
  ])('our own %s keeps status and message', async (kind, status, message) => {
    const response = await server.request('GET', `/throw/${kind}`);
    expect(response.status).toBe(status);
    expect(JSON.parse(response.text)).toEqual({ message });
  });

  test.each([
    ['openai401'], ['openai429'], ['stripe401'], ['stripe402'], ['sdk401'], ['sdk429'],
  ])('a provider error %s becomes a generic 502', async (kind) => {
    const response = await server.request('GET', `/throw/${kind}`);
    expect(response.status).toBe(502);
    expect(JSON.parse(response.text)).toEqual({ message: UPSTREAM_MESSAGE });
    expect(response.text).not.toContain('synthetic-provider-message');
    expect(response.text).not.toContain('sk-synthetic');
    expect(response.text).not.toContain('insufficient_quota');
  });

  test('a 502 is logged at error with the original status kept in the error', async () => {
    await server.request('GET', '/throw/stripe402');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [fields, message] = logger.error.mock.calls[0];
    expect(message).toBe('Request failed');
    expect(fields.statusCode).toBe(502);
    expect(fields.err.statusCode).toBe(402);
  });

  test('a plain error is a 500; its message is shown only outside production', async () => {
    const response = await server.request('GET', '/throw/plain');
    expect(response.status).toBe(500);
    const body = JSON.parse(response.text);
    expect(body.message).toBe('Internal server error');
    if (nodeEnv === 'production') expect(body).toEqual({ message: 'Internal server error' });
    else expect(body.error).toBe('synthetic-internal-detail');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  test('client errors are logged at warn, not error', async () => {
    await server.request('GET', '/throw/own409');
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0].statusCode).toBe(409);
  });

  test('malformed JSON is a 400 with a fixed message that does not quote the body', async () => {
    const response = await server.request('POST', '/echo', { body: '{"resume":"synthetic-body-secret",' });
    expect(response.status).toBe(400);
    expect(JSON.parse(response.text)).toEqual({ message: 'Malformed JSON body.' });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('a body-parser error marked expose keeps its 4xx status', async () => {
    const response = await server.request('POST', '/echo', {
      body: JSON.stringify({ padding: 'x'.repeat(200 * 1024) }),
    });
    expect(response.status).toBe(413);
    expect(JSON.parse(response.text)).toEqual({ message: 'request entity too large' });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('an undecodable path parameter is a 400 "Malformed URL." that does not quote the path', async () => {
    const response = await server.request('GET', '/param/%E0%A4%A');
    expect(response.status).toBe(400);
    expect(JSON.parse(response.text)).toEqual({ message: 'Malformed URL.' });
    expect(response.text).not.toContain('%E0');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('a URIError not raised by the router (no status) is a 500', async () => {
    const app = express();
    app.get('/', () => { throw new URIError('synthetic-uri-detail'); });
    app.use(loadHandler(nodeEnv).errorHandler);
    const local = await serve(app);
    try {
      const response = await local.request('GET', '/');
      expect(response.status).toBe(500);
      expect(JSON.parse(response.text).message).toBe('Internal server error');
    } finally {
      await local.close();
    }
  });
});

describe('resolveStatus', () => {
  const { resolveStatus } = loadHandler('test').errorHandler;

  test.each([
    ['our plain Error with statusCode', 404, Object.assign(new Error('x'), { statusCode: 404 })],
    ['our plain Error with status', 409, Object.assign(new Error('x'), { status: 409 })],
    ['an exposed 4xx subclass', 400, Object.assign(new SyntaxError('x'), { status: 400, expose: true })],
    ['an exposed 5xx subclass', 502, Object.assign(new TypeError('x'), { status: 503, expose: true })],
    ['a non-HTTP status', 500, Object.assign(new Error('x'), { statusCode: 200 })],
    ['a string status', 500, Object.assign(new Error('x'), { statusCode: '404' })],
    ['an error with no status', 500, new Error('x')],
    ['a non-Error object with a status', 502, { status: 401, message: PROVIDER_MESSAGE }],
    ['an OpenAI-like 401', 502, new OpenAILikeAPIError(401)],
    ['a Stripe-like 402', 502, new StripeLikeError(402)],
    ['nothing', 500, undefined],
  ])('%s -> %i', (_name, expected, error) => {
    expect(resolveStatus(error)).toBe(expected);
  });
});

describe('headers already sent', () => {
  let server;
  let logger;
  const handedOn = [];

  beforeAll(async () => {
    const loaded = loadHandler('development');
    logger = loaded.logger;
    server = await serve(buildApp(loaded.errorHandler, {
      afterHandler: (err, req, res, next) => {
        handedOn.push(err);
        next(err);
      },
    }));
  });

  afterAll(() => server.close());

  test('the error is handed to Express and no second response is written', async () => {
    const response = await server.request('GET', '/partial');

    expect(handedOn).toHaveLength(1);
    expect(handedOn[0].message).toBe('synthetic failure after headers');
    expect(response.status).toBe(200);
    expect(response.text).toBe('partial-body');
    expect(response.text).not.toContain('message');
    // Express destroys the socket instead of finishing the response.
    expect(response.aborted).toBe(true);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
