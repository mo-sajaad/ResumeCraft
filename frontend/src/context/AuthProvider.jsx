import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { AuthContext } from "./AuthContext.jsx";
import { auth, signOut } from "../firebase.js";
import { clearAppJwt, getAuthHeaders, getAuthToken } from "../utils/auth";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase Auth user
  const [profile, setProfile] = useState(null); // DB user profile (full_name, role, etc.)
  const [loading, setLoading] = useState(Boolean(auth));

  const refreshProfile = async (firebaseUser = auth?.currentUser) => {
    if (!firebaseUser) {
      setProfile(null);
      return null;
    }

    // Exchange Firebase token for your backend JWT
    await getAuthToken();

    // Fetch the profile from your backend
    const res = await fetch(`/api/users/${firebaseUser.uid}`, {
      headers: await getAuthHeaders(),
    });

    if (!res.ok) {
      throw new Error("Failed to fetch profile");
    }

    const data = await res.json();
    setProfile(data);
    return data;
  };

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          await refreshProfile(firebaseUser);
        } catch (error) {
          console.warn("Auth/Profile error:", error.message);
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
    await signOut(auth);
    clearAppJwt();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
