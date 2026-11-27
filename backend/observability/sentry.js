const Sentry = require('@sentry/node');

const CREDENTIAL_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'stripe-signature',
  'x-api-key',
]);

// URL attributes on transactions and breadcrumbs; the query string can carry
// tokens and identifiers.
const URL_KEYS = ['url', 'http.url', 'url.full', 'http.target'];
const QUERY_KEYS = ['http.query', 'url.query', 'query'];

function stripQuery(value) {
  if (typeof value !== 'string') return value;
  const end = value.search(/[?#]/);
  return end === -1 ? value : value.slice(0, end);
}

function scrubData(data) {
  if (!data || typeof data !== 'object') return;
  for (const key of URL_KEYS) {
    if (key in data) data[key] = stripQuery(data[key]);
  }
  for (const key of QUERY_KEYS) delete data[key];
}

function scrubHeaders(headers) {
  if (!headers || typeof headers !== 'object') return;
  for (const name of Object.keys(headers)) {
    if (CREDENTIAL_HEADERS.has(name.toLowerCase())) delete headers[name];
  }
}

// Requests carry session cookies, bearer tokens and resume content, so only
// the method, the URL without its query and non-credential headers are sent.
function scrubEvent(event) {
  const { request } = event;
  if (request) {
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    request.url = stripQuery(request.url);
    scrubHeaders(request.headers);
  }

  const responseHeaders = event.contexts?.response?.headers;
  scrubHeaders(responseHeaders);

  for (const breadcrumb of event.breadcrumbs || []) scrubData(breadcrumb.data);
  for (const span of event.spans || []) scrubData(span.data);
  scrubData(event.contexts?.trace?.data);

  return event;
}

function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  });

  return true;
}

module.exports = {
  Sentry,
  initSentry,
  scrubEvent,
};
