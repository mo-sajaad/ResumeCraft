import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { AuthContext } from "./AuthContext.jsx";
import { auth, signOut } from "../firebase.js";
import { exchangeFirebaseTokenForJwt } from "../utils/auth";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          await exchangeFirebaseTokenForJwt();
        } catch (error) {
          console.warn("Failed to exchange Firebase token:", error.message);
        }
      } else {
        localStorage.removeItem("jwtToken");
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
    localStorage.removeItem("jwtToken");
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
