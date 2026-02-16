import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { AuthContext } from "./AuthContext.jsx";
import { auth, signOut } from "../firebase.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
