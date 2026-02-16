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

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const requireFirebase = () => {
    if (!hasFirebaseConfig || !auth) {
      setError("Firebase is not configured. Add VITE_FIREBASE_* values to your frontend .env file.");
      return false;
    }
    return true;
  };

  // Handle Google Sign-In
  const handleGoogleSignIn = async () => {
    if (!requireFirebase()) return;

    const provider = new GoogleAuthProvider();
    try {
      setLoading(true);
      setError("");
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, provider);
      navigate("/dashboard");
    } catch {
      setError("Google sign-in failed");
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  // Handle standard email/password sign-in
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(`Failed to sign in: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1>Welcome Back</h1>
      <p className="subtitle">Sign in to continue building your resume</p>

      {/* Google Sign-In Button */}
      <button type="button" className="google-btn" onClick={handleGoogleSignIn} disabled={loading}>
        {loading ? "Signing in..." : "Continue with Google"}
      </button>

      <div className="divider">
        <span>Or continue with email</span>
      </div>

      {/* Email Input */}
      <label>Email</label>
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      {/* Password Input */}
      <label>Password</label>
      <input
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      {/* Remember me and Forgot Password */}
      <div className="options">
        <div className="remember">
          <input type="checkbox" />
          Remember me
        </div>
        <Link to="/auth/forgot-password">Forgot password?</Link>
      </div>

      {/* Display any error messages */}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Submit Button */}
      <button type="submit" disabled={loading}>
        {loading ? "Signing In..." : "Sign In"}
      </button>

      {/* Footer */}
      <div className="auth-footer">
        Don't have an account? <Link to="/auth/signup">Sign up</Link>
      </div>
    </form>
  );
}
