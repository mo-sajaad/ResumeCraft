import { useState } from "react";
import { Link } from "react-router-dom";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  signInWithPopup,
} from "firebase/auth";

import { useAuth } from "../../context/useAuth";
import { auth, hasFirebaseConfig } from "../../firebase";
import { authErrorMessage } from "../../utils/validators";

export default function Signup() {
  const { completeSignUp, prepareGoogleSignUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      // AuthProvider exchanges the token with this name, and RedirectIfAuth
      // opens the dashboard once the session is ready (IDENTITY-014).
      prepareGoogleSignUp(fullName);
      await signInWithPopup(auth, provider);
    } catch (err) {
      prepareGoogleSignUp(null);
      setError(authErrorMessage(err, "Google sign-in failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!requireFirebase()) return;
    if (!acceptedTerms) {
      setError("Please accept the Terms and Privacy Policy to continue.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await setPersistence(auth, browserLocalPersistence);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // RedirectIfAuth now shows the check-your-email page.
      await completeSignUp(userCredential.user, fullName);
    } catch (err) {
      setError(authErrorMessage(err, "We could not create your account. Try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <header className="auth-form-header">
        <h2>Create account</h2>
        <p>Start building tailored resumes and cover letters with AI support.</p>
      </header>

      {error ? <p className="auth-error">{error}</p> : null}

      <button type="button" className="auth-google-btn" onClick={handleGoogleSignIn} disabled={loading}>
        {loading ? "Signing up..." : "Continue with Google"}
      </button>

      <div className="auth-divider">or sign up with email</div>

      <div className="auth-field">
        <label htmlFor="signup-name">Full name</label>
        <input
          type="text"
          id="signup-name"
          placeholder="Jane Doe"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>

      <div className="auth-field">
        <label htmlFor="signup-email">Email</label>
        <input
          type="email"
          id="signup-email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="auth-field">
        <label htmlFor="signup-password">Password</label>
        <input
          type="password"
          id="signup-password"
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <p className="auth-helper">Use at least 8 characters.</p>

      <label className="auth-check" htmlFor="signup-terms">
        <input
          id="signup-terms"
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
        />
        <span>
          I agree to the <a className="auth-link" href="#">Terms</a> and <a className="auth-link" href="#">Privacy Policy</a>.
        </span>
      </label>

      <button type="submit" className="auth-submit-btn" disabled={loading}>
        {loading ? "Creating account..." : "Create Account"}
      </button>

      <p className="auth-footer">
        Already have an account? <Link className="auth-link" to="/auth/login">Sign in</Link>
      </p>
    </form>
  );
}
