// Shared helpers for the admin and observability Jest suites. Everything here
// is synthetic: a scripted database, a captured logger and loopback HTTP.
const http = require('node:http');
const jwt = require('jsonwebtoken');

// Stands in for config/db. Rules added with on() answer matching SQL; the
// newest rule wins and unmatched SQL returns no rows.
function createFakeDb() {
  const users = new Map();
  let rules = [];

  const db = {
    calls: [],
    reset() {
      users.clear();
      rules = [];
      db.calls.length = 0;
    },
    addUser({ id, firebaseUid }) {
      users.set(firebaseUid, {
        id,
        firebase_uid: firebaseUid,
        email: `${firebaseUid}@example.test`,
        token_version: 0,
      });
    },
    on(pattern, respond) {
      rules.unshift({ pattern, respond });
    },
    callsMatching(pattern) {
      return db.calls.filter((call) => pattern.test(call.sql));
    },
    async query(sql, params = [], transaction = null) {
      db.calls.push({ sql, params, transaction });
      const rule = rules.find(({ pattern }) => pattern.test(sql));
      if (rule) return rule.respond(params, { sql, transaction });
      if (/FROM users WHERE firebase_uid/.test(sql)) {
        const user = users.get(params[0]);
        return { rows: user ? [user] : [] };
      }
      return { rows: [] };
    },
    // Each client carries a transaction object so rules can tell transactional
    // writes from autocommitted ones.
    async connect() {
      const transaction = { open: false, onCommit: [] };
      return {
        async query(sql, params = []) {
          const command = sql.trim().toUpperCase();
          if (command.startsWith('BEGIN')) {
            transaction.open = true;
            return { rows: [] };
          }
          if (command.startsWith('COMMIT')) {
            transaction.onCommit.forEach((apply) => apply());
            transaction.onCommit = [];
            transaction.open = false;
            return { rows: [] };
          }
          if (command.startsWith('ROLLBACK')) {
            transaction.onCommit = [];
            transaction.open = false;
            return { rows: [] };
          }
          return db.query(sql, params, transaction.open ? transaction : null);
        },
        release() {},
      };
    },
  };

  return db;
}

// Wraps the real pino so the application's own redaction and serializer options
// run, but writes lines to memory instead of a pino-pretty worker thread.
function createCapturePino(realPino) {
  const lines = [];
  function capturePino(options = {}) {
    return realPino(
      { ...options, transport: undefined },
      { write: (line) => lines.push(line) }
    );
  }
  return Object.assign(capturePino, realPino, { capturedLines: lines });
}

function sessionCookie(firebaseUid) {
  const token = jwt.sign({ uid: firebaseUid, tokenVersion: 0 }, process.env.JWT_SECRET_KEY);
  return `rc_auth=${token}`;
}

// Serves the app on loopback. request() resolves only after the server has also
// finished with the response, so 'finish' listeners (logs, metrics) have run.
async function startServer(app) {
  const pending = new Map();
  let nextId = 0;

  const server = http.createServer((req, res) => {
    const id = req.headers['x-test-request-id'];
    delete req.headers['x-test-request-id'];
    res.once('close', () => pending.get(id)?.());
    app(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  async function request(method, path, { headers = {}, body } = {}) {
    nextId += 1;
    const id = String(nextId);
    const serverDone = new Promise((resolve) => pending.set(id, resolve));

    const response = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          method,
          path,
          agent: false,
          headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...headers,
            'x-test-request-id': id,
          },
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { text += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
        }
      );
      req.on('error', reject);
      req.end(body);
    });

    await serverDone;
    pending.delete(id);
    return {
      ...response,
      json: () => JSON.parse(response.text),
    };
  }

  return { request, close: () => new Promise((resolve) => server.close(resolve)) };
}

// Records an unfixed audit finding. `scenario` runs twice: once as an ordinary
// test, so a broken setup is a real failure, and once under test.failing with
// `assertFixed`. When the bug is fixed the second test fails and asks for
// `.failing` to be removed; convert it to an ordinary test then.
function knownBug(name, scenario, assertFixed) {
  test(`setup is valid for known bug ${name}`, async () => {
    await scenario();
  });
  test.failing(`KNOWN BUG ${name}`, async () => {
    const result = await scenario();
    await assertFixed(result);
  });
}

module.exports = {
  createFakeDb,
  createCapturePino,
  sessionCookie,
  startServer,
  knownBug,
};
