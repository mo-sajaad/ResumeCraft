import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";

import { auth, hasFirebaseConfig } from "../../firebase";
import { validateEmail } from "../../utils/validators";

// Neutral wording: it must not reveal whether an account exists.
const RESET_REQUESTED_MESSAGE = "If an account exists for that email, we've sent a reset link.";
const RESET_ERROR_MESSAGES = {
  "auth/invalid-email": "Enter a valid email address.",
  "auth/missing-email": "Enter a valid email address.",
  "auth/network-request-failed": "We could not reach the server. Check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes, then try again.",
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const resetInFlight = useRef(false);

  const requireFirebase = () => {
    if (!hasFirebaseConfig || !auth) {
      setError("Firebase is not configured. Add VITE_FIREBASE_* values to your frontend .env file.");
      return false;
    }
    return true;
  };

  const handleGoogleSignIn = async () => {
    if (!requireFirebase()) return;

    const provider = new GoogleAuthProvider();
    try {
      setLoading(true);
      setError("");
      await setPersistence(auth, browserLocalPersistence);
      // AuthProvider exchanges the token, and RedirectIfAuth opens the
      // dashboard once the session is ready (IDENTITY-014).
      await signInWithPopup(auth, provider);
    } catch {
      setError("Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (resetInFlight.current) return;
    setError("");
    setNotice("");

    const trimmedEmail = email.trim();
    if (!validateEmail(trimmedEmail)) {
      setError("Enter your email address above, then select Forgot password? again.");
      return;
    }
    if (!requireFirebase()) return;

    resetInFlight.current = true;
    setResetSending(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setNotice(RESET_REQUESTED_MESSAGE);
    } catch (err) {
      const message = RESET_ERROR_MESSAGES[err?.code];
      // Any other failure, including user-not-found, gets the neutral message.
      if (message) setError(message);
      else setNotice(RESET_REQUESTED_MESSAGE);
    } finally {
      resetInFlight.current = false;
      setResetSending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!requireFirebase()) return;

    setLoading(true);
    setError("");
    setNotice("");
    try {
      await setPersistence(auth, browserLocalPersistence);
      // AuthProvider exchanges the token. RedirectIfAuth then opens the
      // dashboard, explains a failure, or shows the check-your-email page (IDENTITY-014).
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(`Failed to sign in: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <header className="auth-form-header">
        <h2>Sign in</h2>
        <p>Access your dashboard, resumes, and Career Lab tools.</p>
      </header>

      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="auth-helper" role="status">{notice}</p> : null}

      <button type="button" className="auth-google-btn" onClick={handleGoogleSignIn} disabled={loading}>
        {loading ? "Signing in..." : "Continue with Google"}
      </button>

      <div className="auth-divider">or use email</div>

      <div className="auth-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="auth-field">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <div className="auth-row">
        <label className="auth-check" htmlFor="remember-me">
          <input id="remember-me" type="checkbox" />
          <span>Remember me</span>
        </label>
        <button
          type="button"
          className="auth-link auth-link-btn"
          onClick={handleForgotPassword}
          disabled={loading || resetSending}
        >
          {resetSending ? "Sending..." : "Forgot password?"}
        </button>
      </div>

      <button type="submit" className="auth-submit-btn" disabled={loading}>
        {loading ? "Signing in..." : "Sign In"}
      </button>

      <p className="auth-footer">
        New to ResumeCraft? <Link className="auth-link" to="/auth/signup">Create an account</Link>
      </p>
    </form>
  );
}
