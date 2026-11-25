import { auth } from "../firebase";

// Error code of an exchange refused because the email is not verified.
export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

let sessionEstablished = false;

export function clearAppJwt() {
  sessionEstablished = false;
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

  return { response, data: await response.json().catch(() => ({})) };
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

  let { response, data } = await postExchange(firebaseToken, fullName);

  // A token issued before the email was verified, such as in another tab, is out of date.
  if (data?.code === EMAIL_NOT_VERIFIED && firebaseUser.emailVerified) {
    const freshToken = await firebaseUser.getIdToken(true);
    if (auth.currentUser?.uid === firebaseUser.uid) {
      ({ response, data } = await postExchange(freshToken, fullName));
    }
  }

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Failed to exchange Firebase token");
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }

  // If another user has signed in meanwhile, their next request must exchange again.
  sessionEstablished = auth.currentUser?.uid === firebaseUser.uid;
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
