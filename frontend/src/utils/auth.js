import { auth } from "../firebase";

// Error code of an exchange refused because the email is not verified.
export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

// How long the app waits for one exchange, profile read or logout before it
// gives up, so a stalled server cannot keep it loading forever (IDENTITY-011).
export const SESSION_REQUEST_TIMEOUT_MS = 15_000;

// Error code of a request that did not finish within SESSION_REQUEST_TIMEOUT_MS.
export const REQUEST_TIMEOUT = "REQUEST_TIMEOUT";
// Error code of an exchange refused because its user is being signed out.
export const LOGGING_OUT = "LOGGING_OUT";
// Error code of a logout the server did not confirm (IDENTITY-012).
export const SERVER_LOGOUT_FAILED = "SERVER_LOGOUT_FAILED";

// UID of the user the session cookie was issued for, so that a direct switch
// to another user exchanges again (IDENTITY-010).
let sessionUid = null;
// Counts the cookies this page has obtained, so a 401 to a request sent with
// an older cookie does not exchange again (IDENTITY-014).
let sessionGeneration = 0;
// The exchange in progress, { uid, fullName, promise }, shared by every caller
// for the same user and name (IDENTITY-014).
let exchangeInFlight = null;
// UID -> number of logouts in progress. Exchanges for these UIDs are refused
// until Firebase sign-out has finished, so a concurrent request cannot obtain
// a new cookie after the server logout (IDENTITY-012).
const loggingOut = new Map();

// Runs work(signal) and rejects with REQUEST_TIMEOUT if it has not settled in
// time. The signal aborts the fetches that use it.
export async function withTimeout(work, timeoutMs = SESSION_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error("The server did not answer in time.");
      error.code = REQUEST_TIMEOUT;
      reject(error);
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// What the could-not-load-your-account panel says about a refused request
// (IDENTITY-009). Only the message of a 4xx JSON answer is shown: 5xx bodies
// are generic and, outside production, carry internal details. Any refusal
// but a timeout or rate limit gets the same answer again, so Retry is not offered.
export function describeRefusal(status, data) {
  const message = data?.message || data?.error;
  if (!(status >= 400 && status < 500) || typeof message !== "string" || !message.trim()) return null;
  return { message, retryable: status === 408 || status === 429 };
}

export function clearAppJwt() {
  sessionUid = null;
  // A later caller must not reuse an exchange that started before this point.
  exchangeInFlight = null;
}

export function getStoredAppJwt() {
  return null;
}

async function postExchange(firebaseToken, fullName, signal) {
  const response = await fetch("/api/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ firebaseToken, fullName }),
    signal,
  });

  const data = await response.json().catch(() => null);
  // The server always answers JSON; anything else, such as an HTML page from a
  // proxy, is not a session even with a 2xx status (IDENTITY-009).
  const isJson = typeof data === "object" && data !== null;
  return { response, data: isJson ? data : {}, isJson };
}

export async function exchangeFirebaseTokenForJwt(preferredFullName = null) {
  const firebaseUser = auth?.currentUser;

  if (!firebaseUser) {
    sessionUid = null;
    return null;
  }

  if (loggingOut.has(firebaseUser.uid)) {
    const error = new Error("Signing out");
    error.code = LOGGING_OUT;
    throw error;
  }

  const sanitizedPreferredName = typeof preferredFullName === "string" ? preferredFullName.trim() : "";
  const fullName = sanitizedPreferredName || firebaseUser.displayName || null;

  const current = exchangeInFlight;
  if (current?.uid === firebaseUser.uid && current.fullName === fullName) return current.promise;

  const record = { uid: firebaseUser.uid, fullName };
  record.promise = withTimeout((signal) => runExchange(firebaseUser, fullName, signal, record))
    .finally(() => {
      if (exchangeInFlight === record) exchangeInFlight = null;
    });
  exchangeInFlight = record;
  return record.promise;
}

async function runExchange(firebaseUser, fullName, signal, record) {
  const firebaseToken = await firebaseUser.getIdToken();

  let { response, data, isJson } = await postExchange(firebaseToken, fullName, signal);

  // A token issued before the email was verified, such as in another tab, is out of date.
  if (data?.code === EMAIL_NOT_VERIFIED && firebaseUser.emailVerified) {
    const freshToken = await firebaseUser.getIdToken(true);
    if (auth.currentUser?.uid === firebaseUser.uid) {
      ({ response, data, isJson } = await postExchange(freshToken, fullName, signal));
    }
  }

  if (!response.ok || !isJson) {
    const error = new Error(data?.message || data?.error || "Failed to exchange Firebase token");
    error.status = response.status;
    error.code = data?.code;
    error.sessionError = describeRefusal(response.status, data);
    throw error;
  }

  sessionGeneration += 1;
  // Its cookie may have replaced a newer one: after another user has signed
  // in, or after clearAppJwt, the next request must exchange again.
  sessionUid = exchangeInFlight === record && auth.currentUser?.uid === firebaseUser.uid
    ? firebaseUser.uid
    : null;
  return "cookie_session";
}

export async function getAuthToken({ forceRefresh = false } = {}) {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) {
    clearAppJwt();
    return null;
  }

  if (sessionUid !== firebaseUser.uid || forceRefresh) {
    await exchangeFirebaseTokenForJwt();
  }

  return "cookie_session";
}

export async function getAuthHeaders(extraHeaders = {}, options) {
  await getAuthToken(options);
  return {
    ...extraHeaders,
  };
}

export async function authFetch(input, init = {}, authOptions = {}) {
  const headers = await getAuthHeaders(init.headers || {}, authOptions);
  const sentWith = sessionGeneration;

  const requestInit = {
    ...init,
    credentials: "include",
    headers,
  };

  let response = await fetch(input, requestInit);

  if (response.status !== 401 || authOptions?.retryOnAuthError === false) {
    return response;
  }

  // Concurrent 401s share one renewal: a request sent before the latest
  // cookie only needs to be sent again (IDENTITY-014).
  await getAuthToken({ forceRefresh: sessionGeneration === sentWith });

  const refreshedHeaders = await getAuthHeaders(init.headers || {});
  response = await fetch(input, {
    ...requestInit,
    headers: refreshedHeaders,
  });

  return response;
}

// Ends every API session of the user, then exchanges a fresh Firebase ID
// token so this device stays signed in. Call after a password change.
export async function signOutOtherSessions() {
  const response = await authFetch("/api/auth/sessions/revoke", { method: "POST" });
  if (!response.ok) {
    const error = new Error("Failed to sign out other sessions");
    error.status = response.status;
    throw error;
  }

  clearAppJwt();
  await auth?.currentUser?.getIdToken(true);
  await exchangeFirebaseTokenForJwt();
}

async function postLogout() {
  const response = await withTimeout((signal) => fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    signal,
  }));
  if (!response.ok) {
    const error = new Error("The server could not end the session");
    error.status = response.status;
    throw error;
  }
}

// Ends the API session of `uid`, then runs signOutOfFirebase even if that
// failed. No exchange for `uid` can start until both are done (IDENTITY-012).
// Rejects with the Firebase error if sign-out failed, otherwise with a
// SERVER_LOGOUT_FAILED error if the server did not confirm the logout.
export async function logoutSession(uid, signOutOfFirebase = async () => {}) {
  loggingOut.set(uid, (loggingOut.get(uid) || 0) + 1);
  let serverError = null;
  try {
    // An exchange already on its way could set a cookie after the logout.
    if (exchangeInFlight?.uid === uid) await exchangeInFlight.promise.catch(() => {});
    try {
      await postLogout();
    } catch (error) {
      serverError = error;
      serverError.code = SERVER_LOGOUT_FAILED;
    }
    await signOutOfFirebase();
  } finally {
    clearAppJwt();
    const count = loggingOut.get(uid) - 1;
    if (count > 0) loggingOut.set(uid, count);
    else loggingOut.delete(uid);
  }
  if (serverError) throw serverError;
}
