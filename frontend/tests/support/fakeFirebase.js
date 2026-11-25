// In-memory Firebase for the sign-in tests; all data is synthetic. As in the
// SDK, an ID token keeps the claims from when it was issued, and emailVerified
// changes only in reload(). Event order and token caching are simplified.
import { vi } from 'vitest';

export const firebase = {
  auth: { currentUser: null },
  listener: null,
  // Set by each test: the user the next sign-in or sign-up produces.
  nextUser: null,
  // Server side, by UID: { verified, displayName }. Outlives a page visit.
  accounts: {},
  signOut: null,
  updateProfile: null,
  sendEmailVerification: null,
};

export function setCurrentUser(user) {
  firebase.auth.currentUser = user;
  firebase.listener?.(user);
}

// `verified` is the server's value; the cached flag and the first token can lag behind it.
export function createUser(uid, { verified = true, cachedVerified = verified, tokenVerified = verified } = {}) {
  const account = firebase.accounts[uid] ??= { verified, displayName: null };
  let claim = tokenVerified;
  const user = {
    uid,
    email: `${uid}@example.test`,
    displayName: account.displayName,
    emailVerified: cachedVerified,
    getIdToken: vi.fn(async (force) => {
      if (force) claim = account.verified;
      return JSON.stringify({ uid, verified: claim });
    }),
    reload: vi.fn(async () => { user.emailVerified = account.verified; }),
  };
  return user;
}

export function resetFirebase() {
  firebase.auth.currentUser = null;
  firebase.accounts = {};
  firebase.nextUser = createUser('uid-one');
  firebase.signOut = vi.fn(async () => setCurrentUser(null));
  firebase.updateProfile = vi.fn(async (user, { displayName }) => {
    firebase.accounts[user.uid].displayName = displayName;
    user.displayName = displayName;
  });
  firebase.sendEmailVerification = vi.fn(async () => {});
}

export function appModule() {
  return { auth: firebase.auth, hasFirebaseConfig: true, signOut: (...args) => firebase.signOut(...args) };
}

export function sdkModule() {
  const signIn = async () => {
    setCurrentUser(firebase.nextUser);
    return { user: firebase.nextUser };
  };
  return {
    GoogleAuthProvider: vi.fn(),
    browserLocalPersistence: {},
    setPersistence: async () => {},
    signInWithPopup: signIn,
    signInWithEmailAndPassword: signIn,
    createUserWithEmailAndPassword: signIn,
    updateProfile: (...args) => firebase.updateProfile(...args),
    sendEmailVerification: (...args) => firebase.sendEmailVerification(...args),
    onAuthStateChanged: (_auth, listener) => {
      firebase.listener = listener;
      queueMicrotask(() => listener(firebase.auth.currentUser));
      return () => { firebase.listener = null; };
    },
  };
}
