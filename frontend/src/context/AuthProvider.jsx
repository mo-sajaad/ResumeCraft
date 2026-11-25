import { useState, useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { AuthContext } from "./AuthContext.jsx";
import { auth, signOut } from "../firebase.js";
import { authFetch, clearAppJwt, getAuthToken, logoutSession } from "../utils/auth";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase Auth user
  const [profile, setProfile] = useState(null); // DB user profile (full_name, role, etc.)
  const [loading, setLoading] = useState(Boolean(auth));
  const [authError, setAuthError] = useState(""); // shown on the sign-in pages
  const profileRequests = useRef({ started: 0, applied: 0 });

  const refreshProfile = async (firebaseUser = auth?.currentUser) => {
    if (!firebaseUser) {
      setProfile(null);
      return null;
    }

    const requests = profileRequests.current;
    const requestId = ++requests.started;

    // Exchange Firebase token for your backend JWT
    await getAuthToken();

    // Fetch the profile from your backend
    const res = await authFetch(`/api/users/${firebaseUser.uid}`);

    if (!res.ok) {
      throw new Error("Failed to fetch profile");
    }

    const data = await res.json();
    // A slow response must not replace a newer one, such as the named profile after sign-up.
    if (requestId > requests.applied) {
      requests.applied = requestId;
      setProfile(data);
    }
    return data;
  };

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        setAuthError("");
        try {
          await refreshProfile(firebaseUser);
        } catch (error) {
          console.warn("Auth/Profile error:", error.message);
          // The email belongs to another account, so this user cannot get a session.
          const isCurrentUser = () => auth.currentUser?.uid === firebaseUser.uid;
          if (error.status === 409 && isCurrentUser()) {
            setAuthError(error.message);
            await logoutSession().catch(() => {});
            // Another user may have signed in during the request.
            if (isCurrentUser()) {
              await signOut(auth).catch((err) => console.warn("Sign-out error:", err.message));
            }
          }
        }
      } else {
        clearAppJwt();
        setProfile(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    if (!auth) return;
    await logoutSession();
    await signOut(auth);
    clearAppJwt();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
