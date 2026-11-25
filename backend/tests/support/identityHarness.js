// In-memory users table for the Identity Jest suites, installed on top of
// createFakeDb() from adminHarness. Everything here is synthetic. It does not
// model citext, locks, isolation levels or concurrent transactions, so it
// cannot show that those work.
const FREE_PLAN_ID = 'synthetic-free-plan';

function uniqueViolation(constraint, detail) {
  return Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), {
    code: '23505',
    constraint,
    table: 'users',
    detail,
  });
}

const emailViolation = (email) => uniqueViolation('users_email_key', `Key (email)=(${email}) already exists.`);

// Replaces db.connect, so call it once; call reset() before each test.
function installUserStore(db) {
  const connect = db.connect;
  let rows = [];
  let nextId = 1;

  const store = {
    // Transaction commands in order, across all clients.
    commands: [],
    connected: 0,
    released: 0,
    reset() {
      db.reset();
      rows = [];
      nextId = 1;
      store.commands.length = 0;
      store.connected = 0;
      store.released = 0;
      installRules();
    },
    add({ firebaseUid, email, fullName = null, tokenVersion = 0 }) {
      const row = {
        id: `user-${nextId}`,
        firebase_uid: firebaseUid,
        email,
        full_name: fullName,
        token_version: tokenVersion,
      };
      nextId += 1;
      rows.push(row);
      return { ...row };
    },
    rows: () => rows.map((row) => ({ ...row })),
    byUid: (uid) => store.rows().find((row) => row.firebase_uid === uid),
  };

  const copy = (row) => (row ? [{ ...row }] : []);

  // Follows the statement's own handling of names, so removing the SQL guard
  // lets an empty name overwrite the stored one here too.
  function upsert([uid, email, rawName], sql) {
    const trims = /NULLIF\(BTRIM\(\$3\), ''\)/.test(sql);
    const name = trims ? rawName?.trim() || null : rawName;
    const keepsName = /COALESCE\(EXCLUDED\.full_name, users\.full_name\)/.test(sql);

    const existing = rows.find((row) => row.firebase_uid === uid);
    if (rows.some((row) => row.email === email && row !== existing)) throw emailViolation(email);
    if (!existing) {
      return { rows: [store.add({ firebaseUid: uid, email, fullName: name })] };
    }
    existing.email = email;
    existing.full_name = keepsName ? name ?? existing.full_name : name;
    return { rows: copy(existing) };
  }

  function update([key, newUid], sql) {
    const row = /WHERE id = \$1/.test(sql)
      ? rows.find(({ id }) => id === key)
      : rows.find(({ firebase_uid: uid }) => uid === key);
    if (!row) return { rows: [] };
    if (/firebase_uid = \$2/.test(sql)) {
      if (rows.some((other) => other !== row && other.firebase_uid === newUid)) {
        throw uniqueViolation('users_firebase_uid_key', `Key (firebase_uid)=(${newUid}) already exists.`);
      }
      row.firebase_uid = newUid;
    }
    if (/token_version = COALESCE\(token_version, 0\) \+ 1/.test(sql)) row.token_version += 1;
    return { rows: copy(row) };
  }

  function installRules() {
    db.on(/FROM plans/, () => ({ rows: [{ id: FREE_PLAN_ID }] }));
    db.on(/FROM users\s+WHERE firebase_uid = \$1/, ([uid]) => ({
      rows: copy(rows.find((row) => row.firebase_uid === uid)),
    }));
    db.on(/FROM users u\s/, ([uid]) => ({ rows: copy(rows.find((row) => row.firebase_uid === uid)) }));
    db.on(/FROM users\s+WHERE email = \$1/, ([email]) => ({
      rows: copy(rows.find((row) => row.email === email)),
    }));
    db.on(/^\s*INSERT INTO users\b/, (params, { sql }) => upsert(params, sql));
    db.on(/^\s*UPDATE users\b/, (params, { sql }) => update(params, sql));
  }

  db.connect = async () => {
    const client = await connect();
    let snapshot = null;
    store.connected += 1;
    return {
      async query(sql, params) {
        const [, command] = /^\s*(BEGIN|COMMIT|ROLLBACK)/i.exec(sql) || [];
        if (command) store.commands.push(command.toUpperCase());
        if (command === 'BEGIN') snapshot = store.rows();
        if (command === 'ROLLBACK' && snapshot) rows = snapshot;
        if (command === 'COMMIT') snapshot = null;
        return client.query(sql, params);
      },
      release() {
        store.released += 1;
        client.release();
      },
    };
  };

  store.reset();
  return store;
}

module.exports = { FREE_PLAN_ID, installUserStore, emailViolation, uniqueViolation };
