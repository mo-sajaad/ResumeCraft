import { auth } from "../firebase";

let sessionEstablished = false;

export function clearAppJwt() {
  sessionEstablished = false;
}

export function getStoredAppJwt() {
  return null;
}

export async function exchangeFirebaseTokenForJwt() {
  const firebaseUser = auth?.currentUser;

  if (!firebaseUser) {
    sessionEstablished = false;
    return null;
  }

  const firebaseToken = await firebaseUser.getIdToken();
  const fullName = firebaseUser.displayName || null;

  const response = await fetch("/api/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ firebaseToken, fullName }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || data?.error || "Failed to exchange Firebase token");
  }

  sessionEstablished = true;
  return "cookie_session";
}

export async function getAuthToken({ forceRefresh = false } = {}) {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) {
    clearAppJwt();
    return null;
  }

  if (!sessionEstablished || forceRefresh) {
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
