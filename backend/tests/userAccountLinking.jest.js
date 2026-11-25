// IDENTITY-002 and 003 in userService and userRepository, against a fake
// database. Matching of email case, locks and races need real PostgreSQL.
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());

const db = require('../config/db');
const userRepository = require('../modules/identity/repositories/userRepository');
const userService = require('../services/userService');
const { FREE_PLAN_ID, emailViolation, installUserStore, uniqueViolation } = require('./support/identityHarness');

const UID = 'synthetic-uid-one';
const NEW_UID = 'synthetic-uid-two';
const EMAIL = 'private.person@example.test';

let store;

beforeAll(() => { store = installUserStore(db); });
beforeEach(() => store.reset());

const upserts = () => db.callsMatching(/INSERT INTO users/);
const updates = () => db.callsMatching(/UPDATE users/);

// Throws the given errors from successive saves, then lets them succeed.
function failSaves(...errors) {
  const remaining = [...errors];
  db.on(/INSERT INTO users/, (params) => {
    if (remaining.length) throw remaining.shift();
    return { rows: [store.add({ firebaseUid: params[0], email: params[1], fullName: params[2] })] };
  });
}

function expectClientsReleased(count) {
  expect([store.connected, store.released]).toEqual([count, count]);
}

describe('names', () => {
  it.each([[null], [undefined], [''], ['   ']])('findOrCreateUser(%j) keeps the stored name', async (name) => {
    store.add({ firebaseUid: UID, email: EMAIL, fullName: 'Stored Name' });

    await userService.findOrCreateUser(UID, EMAIL, name);

    expect(store.byUid(UID).full_name).toBe('Stored Name');
  });

  it.each([[null], [undefined], [''], ['   ']])('linkUserToVerifiedEmail(%j) keeps the stored name', async (name) => {
    store.add({ firebaseUid: UID, email: EMAIL, fullName: 'Stored Name' });

    await userService.linkUserToVerifiedEmail(NEW_UID, EMAIL, name);

    expect(store.byUid(NEW_UID).full_name).toBe('Stored Name');
  });

  it('the upsert treats a blank name as missing and never replaces a name with a missing one', async () => {
    await userRepository.insertOrUpdateUser(db, { firebaseUid: UID, email: EMAIL, fullName: null });

    const [{ sql }] = upserts();
    expect(sql).toContain("NULLIF(BTRIM($3), '')");
    expect(sql).toContain('full_name = COALESCE(EXCLUDED.full_name, users.full_name)');
  });
});

describe('findOrCreateUser conflicts', () => {
  it('rolls back, retries once and commits after one email conflict', async () => {
    failSaves(emailViolation(EMAIL));

    const user = await userService.findOrCreateUser(UID, EMAIL, 'Given Name');

    expect(user).toMatchObject({ firebase_uid: UID, email: EMAIL });
    expect(store.commands).toEqual(['BEGIN', 'ROLLBACK', 'BEGIN', 'COMMIT']);
    expect(upserts().map(({ params }) => params)).toEqual([
      [UID, EMAIL, 'Given Name'],
      [UID, EMAIL, 'Given Name'],
    ]);
    expect(db.callsMatching(/INSERT INTO subscriptions/).map(({ params }) => params)).toEqual([
      [user.id, FREE_PLAN_ID],
    ]);
    expectClientsReleased(2);
  });

  it('reports EMAIL_IN_USE, without linking, after two email conflicts', async () => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL });

    await expect(userService.findOrCreateUser(NEW_UID, EMAIL)).rejects.toMatchObject({ code: 'EMAIL_IN_USE' });

    expect(store.commands).toEqual(['BEGIN', 'ROLLBACK', 'BEGIN', 'ROLLBACK']);
    expect(upserts()).toHaveLength(2);
    expect(updates()).toEqual([]);
    expect(store.rows()).toEqual([holder]);
    expectClientsReleased(2);
  });

  it.each([
    ['23505 on the UID constraint', uniqueViolation('users_firebase_uid_key')],
    ['23505 on a similarly named constraint', uniqueViolation('users_email_key2')],
    ['23505 without a constraint name', uniqueViolation(undefined)],
    ['another code that names the email constraint', Object.assign(emailViolation(EMAIL), { code: '23514' })],
    ['a serialization failure', Object.assign(new Error('synthetic'), { code: '40001' })],
    ['an error without a code', new Error('synthetic')],
  ])('rethrows %s without a retry', async (_label, error) => {
    failSaves(error);

    await expect(userService.findOrCreateUser(UID, EMAIL)).rejects.toBe(error);

    expect(store.commands).toEqual(['BEGIN', 'ROLLBACK']);
    expect(upserts()).toHaveLength(1);
    expect(updates()).toEqual([]);
    expectClientsReleased(1);
  });

  it('rethrows a different error from the retry', async () => {
    const error = uniqueViolation('users_firebase_uid_key');
    failSaves(emailViolation(EMAIL), error);

    await expect(userService.findOrCreateUser(UID, EMAIL)).rejects.toBe(error);

    expect(store.commands).toEqual(['BEGIN', 'ROLLBACK', 'BEGIN', 'ROLLBACK']);
    expectClientsReleased(2);
  });
});

describe('linkUserToVerifiedEmail', () => {
  it('moves the row inside the transaction', async () => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL, tokenVersion: 2 });

    const user = await userService.linkUserToVerifiedEmail(NEW_UID, EMAIL);

    expect(user).toMatchObject({ id: holder.id, firebase_uid: NEW_UID, token_version: 3 });
    expect(store.rows()).toHaveLength(1);
    expect(updates()).toHaveLength(1);
    const inTransaction = db.callsMatching(/WHERE email|UPDATE users|INSERT INTO users/);
    expect(inTransaction).toHaveLength(3);
    inTransaction.forEach(({ transaction }) => expect(transaction).not.toBeNull());
    expect(new Set(inTransaction.map(({ transaction }) => transaction)).size).toBe(1);
    expect(store.commands).toEqual(['BEGIN', 'COMMIT']);
    expectClientsReleased(1);
  });

  it('creates the user when nobody holds the email any more', async () => {
    const user = await userService.linkUserToVerifiedEmail(NEW_UID, EMAIL);

    expect(user).toMatchObject({ firebase_uid: NEW_UID, token_version: 0 });
    expect(updates()).toEqual([]);
    expect(store.commands).toEqual(['BEGIN', 'COMMIT']);
  });

  it('refuses with EMAIL_IN_USE when the UID already has a row', async () => {
    store.add({ firebaseUid: UID, email: EMAIL });
    store.add({ firebaseUid: NEW_UID, email: 'other.person@example.test' });
    const before = store.rows();

    await expect(userService.linkUserToVerifiedEmail(NEW_UID, EMAIL)).rejects.toMatchObject({ code: 'EMAIL_IN_USE' });

    expect(store.rows()).toEqual(before);
    expect(updates()).toEqual([]);
    expect(upserts()).toEqual([]);
    expect(store.commands).toEqual(['BEGIN', 'ROLLBACK']);
    expectClientsReleased(1);
  });

  it('reports an email conflict as EMAIL_IN_USE and undoes the move', async () => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL });
    failSaves(emailViolation(EMAIL));

    await expect(userService.linkUserToVerifiedEmail(NEW_UID, EMAIL)).rejects.toMatchObject({ code: 'EMAIL_IN_USE' });

    expect(updates()).toHaveLength(1);
    expect(store.rows()).toEqual([holder]);
    expectClientsReleased(1);
  });

  it.each([
    ['the move', /UPDATE users/],
    ['the upsert', /INSERT INTO users/],
    ['the plan lookup', /FROM plans/],
    ['the subscription', /INSERT INTO subscriptions/],
  ])('rolls back and rethrows when %s fails', async (_label, pattern) => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL });
    const error = uniqueViolation('synthetic_other_key');
    db.on(pattern, () => { throw error; });

    await expect(userService.linkUserToVerifiedEmail(NEW_UID, EMAIL)).rejects.toBe(error);

    expect(store.rows()).toEqual([holder]);
    expect(store.commands).toEqual(['BEGIN', 'ROLLBACK']);
    expectClientsReleased(1);
  });
});

describe('moveEmailHolderToUid', () => {
  const move = () => userRepository.moveEmailHolderToUid(db, { firebaseUid: NEW_UID, email: EMAIL });

  it('does nothing when nobody holds the email', async () => {
    store.add({ firebaseUid: UID, email: 'other.person@example.test' });

    expect(await move()).toBe(true);
    expect(updates()).toEqual([]);
  });

  it('does nothing when the UID already holds the email', async () => {
    store.add({ firebaseUid: NEW_UID, email: EMAIL });

    expect(await move()).toBe(true);
    expect(updates()).toEqual([]);
  });

  it('returns false and changes nothing when the UID has another row', async () => {
    store.add({ firebaseUid: UID, email: EMAIL });
    store.add({ firebaseUid: NEW_UID, email: 'other.person@example.test' });
    const before = store.rows();

    expect(await move()).toBe(false);
    expect(updates()).toEqual([]);
    expect(store.rows()).toEqual(before);
  });

  it('otherwise moves the row and bumps token_version in one UPDATE', async () => {
    const holder = store.add({ firebaseUid: UID, email: EMAIL, fullName: 'Stored Name', tokenVersion: 6 });
    const other = store.add({ firebaseUid: 'synthetic-uid-three', email: 'third.person@example.test' });

    expect(await move()).toBe(true);
    expect(updates()).toHaveLength(1);
    expect(store.rows()).toEqual([{ ...holder, firebase_uid: NEW_UID, token_version: 7 }, other]);
  });
});
