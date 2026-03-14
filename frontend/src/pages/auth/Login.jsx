import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";

import { auth, hasFirebaseConfig } from "../../firebase";
import { exchangeFirebaseTokenForJwt } from "../../utils/auth";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const destination = "/dashboard";

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
      await signInWithPopup(auth, provider);
      await exchangeFirebaseTokenForJwt();
      navigate(destination, { replace: true });
    } catch {
      setError("Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!requireFirebase()) return;

    setLoading(true);
    setError("");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      await exchangeFirebaseTokenForJwt();
      navigate(destination, { replace: true });
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
        <button type="button" className="auth-link auth-link-btn" onClick={() => setError("Use the Reset password option in Settings after signing in.")}>Forgot password?</button>
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
