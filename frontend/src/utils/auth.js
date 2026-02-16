import { auth } from "../firebase";

const APP_JWT_KEY = "jwtToken";

export async function exchangeFirebaseTokenForJwt() {
  const firebaseUser = auth?.currentUser;

  if (!firebaseUser) {
    return null;
  }

  const firebaseToken = await firebaseUser.getIdToken();

  const response = await fetch("/api/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firebaseToken }),
  });

  const data = await response.json();

  if (!response.ok || !data?.token) {
    throw new Error(data?.error || "Failed to exchange Firebase token");
  }

  localStorage.setItem(APP_JWT_KEY, data.token);
  return data.token;
}

export async function getAuthToken() {
  const appJwt = localStorage.getItem(APP_JWT_KEY);
  if (appJwt) {
    return appJwt;
  }

  const firebaseUser = auth?.currentUser;
  if (firebaseUser) {
    return firebaseUser.getIdToken();
  }

  return localStorage.getItem("token");
}

export async function getAuthHeaders(extraHeaders = {}) {
  const token = await getAuthToken();

  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}