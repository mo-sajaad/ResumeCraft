import { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, sendEmailVerification, updateProfile } from "firebase/auth";

import { AuthContext } from "./AuthContext.jsx";
import { auth, signOut } from "../firebase.js";
import {
  EMAIL_NOT_VERIFIED,
  authFetch,
  clearAppJwt,
  exchangeFirebaseTokenForJwt,
  getAuthToken,
  logoutSession,
} from "../utils/auth";

const isCurrentUser = (firebaseUser) => auth.currentUser?.uid === firebaseUser.uid;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase Auth user
  const [profile, setProfile] = useState(null); // DB user profile (full_name, role, etc.)
  const [loading, setLoading] = useState(Boolean(auth));
  const [authError, setAuthError] = useState(""); // shown on the sign-in pages
  // State, because Firebase changes user.emailVerified in place.
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState(null); // { uid, status, errorCode }
  const signUp = useRef(null); // { uid, fullName } of a sign-up in this page visit
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
    // A slow response must not replace a newer one, or another user's.
    if (requestId > requests.applied && isCurrentUser(firebaseUser)) {
      requests.applied = requestId;
      setProfile(data);
    }
    return data;
  };

  // The email belongs to another account, so this user cannot get a session.
  const endRefusedSession = async (firebaseUser, message) => {
    setAuthError(message);
    await logoutSession().catch(() => {});
    // Another user may have signed in during the request.
    if (isCurrentUser(firebaseUser)) {
      await signOut(auth).catch((err) => console.warn("Sign-out error:", err.message));
    }
  };

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      setNeedsEmailVerification(Boolean(firebaseUser) && !firebaseUser.emailVerified);

      if (firebaseUser) setAuthError("");

      if (firebaseUser?.emailVerified) {
        try {
          await refreshProfile(firebaseUser);
        } catch (error) {
          console.warn("Auth/Profile error:", error.message);
          if (error.status === 409 && isCurrentUser(firebaseUser)) {
            await endRefusedSession(firebaseUser, error.message);
          } else if (error.code === EMAIL_NOT_VERIFIED && isCurrentUser(firebaseUser)) {
            setNeedsEmailVerification(true);
          }
        }
      } else {
        // Signed out, or no session until the email is verified.
        clearAppJwt();
        setProfile(null);
        if (!firebaseUser) setVerificationEmail(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const sendVerificationEmail = async (firebaseUser = auth?.currentUser) => {
    if (!firebaseUser) return;
    const { uid } = firebaseUser;
    if (isCurrentUser(firebaseUser)) setVerificationEmail({ uid, status: "sending" });
    let result = { uid, status: "sent" };
    try {
      await sendEmailVerification(firebaseUser);
    } catch (error) {
      result = { uid, status: "failed", errorCode: error.code };
    }
    setVerificationEmail((previous) => (previous?.uid === uid ? result : previous));
  };

  // Never rejects: the account exists, and the check-your-email page can resend.
  const completeSignUp = async (firebaseUser, fullName) => {
    signUp.current = { uid: firebaseUser.uid, fullName };
    if (isCurrentUser(firebaseUser)) setVerificationEmail({ uid: firebaseUser.uid, status: "sending" });
    // Keeps the name with the account until the first session, on any device.
    await updateProfile(firebaseUser, { displayName: fullName }).catch(() => {});
    await sendVerificationEmail(firebaseUser);
  };

  // Resolves to false if the email is still not verified.
  const confirmEmailVerified = async () => {
    const firebaseUser = auth?.currentUser;
    if (!firebaseUser) return false;

    await firebaseUser.reload();
    if (!firebaseUser.emailVerified) return false;
    // The current ID token still says the email is not verified.
    await firebaseUser.getIdToken(true);
    if (!isCurrentUser(firebaseUser)) return false;

    try {
      const { uid, fullName } = signUp.current || {};
      await exchangeFirebaseTokenForJwt(uid === firebaseUser.uid ? fullName : null);
    } catch (error) {
      if (error.code === EMAIL_NOT_VERIFIED) return false;
      if (error.status !== 409 || !isCurrentUser(firebaseUser)) throw error;
      await endRefusedSession(firebaseUser, error.message);
      // Sign-out failed, so the page is still open and must explain.
      if (isCurrentUser(firebaseUser)) throw error;
      return true;
    }
    if (!isCurrentUser(firebaseUser)) return false;

    await refreshProfile(firebaseUser).catch((error) => console.warn("Auth/Profile error:", error.message));
    if (isCurrentUser(firebaseUser)) setNeedsEmailVerification(false);
    return true;
  };

  const logout = async () => {
    if (!auth) return;
    await logoutSession();
    await signOut(auth);
    clearAppJwt();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      authError,
      needsEmailVerification,
      verificationEmail,
      logout,
      refreshProfile,
      completeSignUp,
      sendVerificationEmail,
      confirmEmailVerified,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
