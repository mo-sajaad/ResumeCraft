import { auth } from "../firebase";

const APP_JWT_KEY = "jwtToken";
const JWT_EXPIRY_BUFFER_MS = 30 * 1000;

function decodeJwtPayload(token) {
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;

    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );

    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  const expSeconds = payload?.exp;

  if (typeof expSeconds !== "number") {
    return true;
  }

  return Date.now() >= expSeconds * 1000 - JWT_EXPIRY_BUFFER_MS;
}

export function clearAppJwt() {
  localStorage.removeItem(APP_JWT_KEY);
}

export function getStoredAppJwt() {
  const token = localStorage.getItem(APP_JWT_KEY);

  if (!token) return null;

  if (isTokenExpired(token)) {
    clearAppJwt();
    return null;
  }

  return token;
}

export async function exchangeFirebaseTokenForJwt() {
  const firebaseUser = auth?.currentUser;

  if (!firebaseUser) {
    return null;
  }

  const firebaseToken = await firebaseUser.getIdToken();
  const fullName = firebaseUser.displayName || null;

  const response = await fetch("/api/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firebaseToken, fullName }),
  });

  const data = await response.json();

  if (!response.ok || !data?.token) {
    throw new Error(data?.error || "Failed to exchange Firebase token");
  }

  localStorage.setItem(APP_JWT_KEY, data.token);
  return data.token;
}

export async function getAuthToken({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const storedToken = getStoredAppJwt();
    if (storedToken) {
      return storedToken;
    }

    const firebaseUser = auth?.currentUser;
    if (!firebaseUser) {
      clearAppJwt();
      return null;
    }

    return exchangeFirebaseTokenForJwt();
  }

  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) {
    clearAppJwt();
    return null;
  }

  return exchangeFirebaseTokenForJwt();
}

export async function getAuthHeaders(extraHeaders = {}, options) {
  const token = await getAuthToken(options);

  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
