import { auth } from "../firebase";

// Error code of an exchange refused because the email is not verified.
export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

// UID of the user the session cookie was issued for, so that a direct switch
// to another user exchanges again (IDENTITY-010).
let sessionUid = null;

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
}

export function getStoredAppJwt() {
  return null;
}

async function postExchange(firebaseToken, fullName) {
  const response = await fetch("/api/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ firebaseToken, fullName }),
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

  const firebaseToken = await firebaseUser.getIdToken();
  const sanitizedPreferredName = typeof preferredFullName === "string" ? preferredFullName.trim() : "";
  const fullName = sanitizedPreferredName || firebaseUser.displayName || null;

  let { response, data, isJson } = await postExchange(firebaseToken, fullName);

  // A token issued before the email was verified, such as in another tab, is out of date.
  if (data?.code === EMAIL_NOT_VERIFIED && firebaseUser.emailVerified) {
    const freshToken = await firebaseUser.getIdToken(true);
    if (auth.currentUser?.uid === firebaseUser.uid) {
      ({ response, data, isJson } = await postExchange(freshToken, fullName));
    }
  }

  if (!response.ok || !isJson) {
    const error = new Error(data?.message || data?.error || "Failed to exchange Firebase token");
    error.status = response.status;
    error.code = data?.code;
    error.sessionError = describeRefusal(response.status, data);
    throw error;
  }

  // If another user has signed in meanwhile, their next request must exchange again.
  sessionUid = auth.currentUser?.uid === firebaseUser.uid ? firebaseUser.uid : null;
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

  const requestInit = {
    ...init,
    credentials: "include",
    headers,
  };

  let response = await fetch(input, requestInit);

  if (response.status !== 401 || authOptions?.retryOnAuthError === false) {
    return response;
  }

  await getAuthToken({ forceRefresh: true });

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

export async function logoutSession() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } finally {
    clearAppJwt();
  }
}
