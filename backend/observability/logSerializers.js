// Decides what may reach the logs. Requests, responses and errors are
// allow-listed; other logged objects lose sensitive keys at any depth.
const { isNativeError } = require('node:util').types;
const { routeLabel } = require('./routeLabel');

const CENSOR = '[REDACTED]';
const MAX_DEPTH = 5;
const MAX_ITEMS = 20;
const MAX_FRAME_LENGTH = 500;

const CREDENTIAL_HEADERS = ['authorization', 'cookie'];
const SENSITIVE_KEY = /token|secret|passw|authorization|cookie|credential|signature|session|jwt|api[-_]?key|private[-_]?key/i;
const CONTENT_KEYS = new Set([
  'body', 'rawbody', 'headers', 'query', 'params', 'url', 'originalurl', 'path',
  'detail', 'details', 'hint', 'where', 'message', 'errormessage', 'stack', 'email',
]);

const IDENTIFIER = /^[A-Za-z_$][\w$]{0,63}$/;
const ERROR_CODE = /^[\w/-]{1,64}$/;
const LOCATION = '(?:node:|file://|/|[A-Za-z]:\\\\)[^()\\n]*:\\d+:\\d+';
const STACK_FRAME = new RegExp(
  `^ {4}at (?:(?:async )?${LOCATION}|[\\w$.<>#\\[\\] ]+ \\((?:${LOCATION}|<anonymous>|index \\d+)\\))$`
);

function isError(value) {
  return isNativeError(value) || value instanceof Error;
}

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

// Messages can quote bodies, tokens and database values, and the stack repeats
// them, so only the trailing frames are kept.
function stackFrames({ stack, message }) {
  if (typeof stack !== 'string') return undefined;

  const start = typeof message === 'string' ? stack.indexOf(message) : -1;
  const lines = (start === -1 ? stack : stack.slice(start + message.length)).split('\n');
  const frames = [];
  while (lines.length && lines[lines.length - 1].length <= MAX_FRAME_LENGTH && STACK_FRAME.test(lines[lines.length - 1])) {
    frames.unshift(lines.pop());
  }
  return frames.length ? frames.join('\n') : undefined;
}

function errorType(err) {
  const name = err.constructor?.name;
  return typeof name === 'string' && IDENTIFIER.test(name) ? name : 'Error';
}

function matching(value, pattern) {
  return typeof value === 'string' && pattern.test(value) ? value : undefined;
}

function serializeError(err, depth = 0) {
  if (typeof err !== 'object' || err === null) return { type: typeof err };

  const status = err.statusCode || err.status;
  const serialized = {
    type: errorType(err),
    code: Number.isInteger(err.code) ? err.code : matching(err.code, ERROR_CODE),
    status: Number.isInteger(status) ? status : undefined,
    // Schema and system call names; unlike the message they hold no row values.
    table: matching(err.table, IDENTIFIER),
    column: matching(err.column, IDENTIFIER),
    constraint: matching(err.constraint, IDENTIFIER),
    syscall: matching(err.syscall, IDENTIFIER),
    stack: stackFrames(err),
  };

  if (depth < MAX_DEPTH) {
    if (typeof err.cause === 'object' && err.cause !== null) {
      serialized.cause = serializeError(err.cause, depth + 1);
    }
    if (Array.isArray(err.errors)) {
      serialized.errors = err.errors.slice(0, MAX_ITEMS).map((item) => serializeError(item, depth + 1));
    }
  }

  return serialized;
}

// The URL is left out: it can carry identifiers and tokens. The response has
// the route.
function serializeRequest(req) {
  const headers = {};
  for (const name of CREDENTIAL_HEADERS) {
    if (req?.headers?.[name]) headers[name] = CENSOR;
  }
  return { id: req?.id, method: req?.method, headers };
}

function serializeResponse(res) {
  return {
    statusCode: res?.headersSent ? res.statusCode : null,
    route: res?.req ? routeLabel(res.req, res) : undefined,
  };
}

const serializers = { req: serializeRequest, res: serializeResponse, err: serializeError };

function sanitize(value, depth = 0) {
  if (typeof value !== 'object' || value === null || value instanceof Date) return value;
  if (isError(value)) return serializeError(value);
  if (depth >= MAX_DEPTH) return '[Truncated]';
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item) => sanitize(item, depth + 1));
  if (!isPlainObject(value)) return `[${errorType(value)}]`;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (depth === 0 && Object.hasOwn(serializers, key)) return [key, item];
    if (SENSITIVE_KEY.test(key) || CONTENT_KEYS.has(key.toLowerCase())) return [key, CENSOR];
    return [key, sanitize(item, depth + 1)];
  }));
}

// pino hook: runs for every log call, including child and request loggers.
function logMethod([first, ...rest], method) {
  const merge = isError(first) ? { err: first } : sanitize(first);
  const args = rest.map((arg) => (isError(arg) ? errorType(arg) : sanitize(arg)));

  // Without a message pino would use err.message.
  if (merge?.err && args[0] === undefined && merge.msg === undefined) args[0] = 'Error';

  return method.apply(this, [merge, ...args]);
}

module.exports = { CENSOR, serializers, logMethod };
