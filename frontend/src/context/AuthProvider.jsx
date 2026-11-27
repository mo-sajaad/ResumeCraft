import { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, sendEmailVerification, updateProfile } from "firebase/auth";

import { AuthContext } from "./AuthContext.jsx";
import { auth, signOut } from "../firebase.js";
import {
  EMAIL_NOT_VERIFIED,
  SERVER_LOGOUT_FAILED,
  authFetch,
  clearAppJwt,
  describeRefusal,
  exchangeFirebaseTokenForJwt,
  getAuthToken,
  logoutSession,
  withTimeout,
} from "../utils/auth";

const isCurrentUser = (firebaseUser) => auth.currentUser?.uid === firebaseUser.uid;

const NO_PROFILE = { uid: null, data: null };

// Shown on the sign-in page when Firebase signed out but the server did not
// confirm the logout, so its cookie may still be valid (IDENTITY-012).
const SERVER_LOGOUT_FAILED_MESSAGE =
  "You are signed out on this device, but the server could not confirm it. "
  + "On a shared device, sign in and sign out again.";

// Ignores a result that arrives after another user has signed in. `error` is
// the { message, retryable } of a refusal, kept only with an "error" status.
function setSessionStatus(setSession, firebaseUser, status, error = null) {
  if (!isCurrentUser(firebaseUser)) return;
  const { uid } = firebaseUser;
  // A failed later refresh leaves a loaded profile on screen.
  setSession((previous) => (
    status === "error" && previous.uid === uid && previous.status === "ready"
      ? previous
      : { uid, status, error: status === "error" ? error : null }
  ));
}

const sessionErrorOf = (error) => error?.sessionError ?? null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase Auth user
  // DB user profile (full_name, role, etc.), with the UID it belongs to (IDENTITY-010).
  const [profileState, setProfileState] = useState(NO_PROFILE);
  // API session and first profile load of one UID: "loading", "ready" or "error" (IDENTITY-009).
  const [session, setSession] = useState({ uid: null, status: "loading", error: null });
  const [loading, setLoading] = useState(Boolean(auth));
  const [authError, setAuthError] = useState(""); // shown on the sign-in pages
  // State, because Firebase changes user.emailVerified in place.
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState(null); // { uid, status, errorCode }
  const signUp = useRef(null); // { uid, fullName } of a sign-up in this page visit
  const profileRequests = useRef({ started: 0, applied: 0 });
  // Name typed on the sign-up form before a Google sign-in. The provider's own
  // exchange sends it, so Signup does not need a second one (IDENTITY-014).
  const googleSignUpName = useRef(null);

  const refreshProfile = async (firebaseUser = auth?.currentUser) => {
    if (!firebaseUser) {
      setProfileState(NO_PROFILE);
      return null;
    }

    const requests = profileRequests.current;
    const requestId = ++requests.started;

    // Exchange Firebase token for your backend JWT
    const pendingName = googleSignUpName.current;
    if (pendingName) {
      googleSignUpName.current = null;
      await exchangeFirebaseTokenForJwt(pendingName);
    } else {
      await getAuthToken();
    }

    // Fetch the profile from your backend. A stalled answer ends as an error,
    // so the could-not-load-your-account message can show (IDENTITY-011).
    const data = await withTimeout(async (signal) => {
      const res = await authFetch(`/api/users/${firebaseUser.uid}`, { signal });

      if (!res.ok) {
        const error = new Error("Failed to fetch profile");
        error.sessionError = describeRefusal(res.status, await res.json().catch(() => null));
        throw error;
      }

      return res.json();
    });
    // A slow response must not replace a newer one, or another user's.
    if (requestId > requests.applied && isCurrentUser(firebaseUser)) {
      requests.applied = requestId;
      setProfileState({ uid: firebaseUser.uid, data });
      setSessionStatus(setSession, firebaseUser, "ready");
    }
    return data;
  };

  // The email belongs to another account, so this user cannot get a session.
  const endRefusedSession = async (firebaseUser, message) => {
    setAuthError(message);
    await logoutSession(firebaseUser.uid, async () => {
      // Another user may have signed in during the request.
      if (isCurrentUser(firebaseUser)) await signOut(auth);
    }).catch((err) => console.warn("Sign-out error:", err.message));
  };

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      // Another user's profile and session state must never be shown (IDENTITY-010).
      const uid = firebaseUser?.uid ?? null;
      setProfileState((previous) => (previous.uid === uid ? previous : NO_PROFILE));
      setSession((previous) => (previous.uid === uid ? previous : { uid, status: "loading", error: null }));

      setNeedsEmailVerification(Boolean(firebaseUser) && !firebaseUser.emailVerified);

      if (firebaseUser) setAuthError("");

      if (firebaseUser?.emailVerified) {
        try {
          await refreshProfile(firebaseUser);
        } catch (error) {
          console.warn("Auth/Profile error:", error.message);
          if (error.status === 409 && isCurrentUser(firebaseUser)) {
            await endRefusedSession(firebaseUser, error.message);
            // Still signed in only if Firebase sign-out failed.
            setSessionStatus(setSession, firebaseUser, "error", sessionErrorOf(error));
          } else if (error.code === EMAIL_NOT_VERIFIED && isCurrentUser(firebaseUser)) {
            setNeedsEmailVerification(true);
          } else {
            setSessionStatus(setSession, firebaseUser, "error", sessionErrorOf(error));
          }
        }
      } else {
        // Signed out, or no session until the email is verified.
        clearAppJwt();
        setProfileState(NO_PROFILE);
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
  // Call before the Google pop-up with the typed name, and with null if it fails.
  const prepareGoogleSignUp = (fullName) => {
    googleSignUpName.current = typeof fullName === "string" && fullName.trim() ? fullName.trim() : null;
  };

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

    await refreshProfile(firebaseUser).catch((error) => {
      console.warn("Auth/Profile error:", error.message);
      setSessionStatus(setSession, firebaseUser, "error", sessionErrorOf(error));
    });
    if (isCurrentUser(firebaseUser)) setNeedsEmailVerification(false);
    return true;
  };

  // The Retry of the could-not-load-your-account message.
  const retrySession = async () => {
    const firebaseUser = auth?.currentUser;
    if (!firebaseUser) return;
    setSessionStatus(setSession, firebaseUser, "loading");
    try {
      await refreshProfile(firebaseUser);
    } catch (error) {
      console.warn("Auth/Profile error:", error.message);
      setSessionStatus(setSession, firebaseUser, "error", sessionErrorOf(error));
    }
  };

  // Signs out of Firebase even when the server logout fails. Rejects if either
  // failed; when only the server did, the sign-in page also explains (IDENTITY-012).
  const logout = async () => {
    if (!auth) return;
    try {
      await logoutSession(auth.currentUser?.uid ?? null, () => signOut(auth));
    } catch (error) {
      if (error.code === SERVER_LOGOUT_FAILED && !auth.currentUser) setAuthError(SERVER_LOGOUT_FAILED_MESSAGE);
      throw error;
    } finally {
      if (!auth.currentUser) setProfileState(NO_PROFILE);
    }
  };

  const profile = user && profileState.uid === user.uid ? profileState.data : null;
  // "idle" while signed out or waiting for email verification; then the
  // session of this UID, which is "loading" until its first result.
  let sessionStatus = "idle";
  if (user && !needsEmailVerification) {
    sessionStatus = session.uid === user.uid ? session.status : "loading";
  }
  // { message, retryable } of the refusal behind an "error" status, or null.
  const sessionError = sessionStatus === "error" ? session.error : null;

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      sessionStatus,
      sessionError,
      loading,
      authError,
      needsEmailVerification,
      verificationEmail,
      logout,
      refreshProfile,
      retrySession,
      completeSignUp,
      prepareGoogleSignUp,
      sendVerificationEmail,
      confirmEmailVerified,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
