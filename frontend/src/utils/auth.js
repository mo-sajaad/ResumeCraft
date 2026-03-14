import { auth } from "../firebase";

let sessionEstablished = false;

export function clearAppJwt() {
  sessionEstablished = false;
}

export function getStoredAppJwt() {
  return null;
}

export async function exchangeFirebaseTokenForJwt(preferredFullName = null) {
  const firebaseUser = auth?.currentUser;

  if (!firebaseUser) {
    sessionEstablished = false;
    return null;
  }

  const firebaseToken = await firebaseUser.getIdToken();
  const sanitizedPreferredName = typeof preferredFullName === "string" ? preferredFullName.trim() : "";
  const fullName = sanitizedPreferredName || firebaseUser.displayName || null;

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
