import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";

import { useAuth } from "../../context/useAuth";
import { auth, hasFirebaseConfig } from "../../firebase";

export default function Signup() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  const requireFirebase = () => {
    if (!hasFirebaseConfig || !auth) {
      setError("Firebase is not configured. Add VITE_FIREBASE_* values to your frontend .env file.");
      return false;
    }
    return true;
  };

  // Handle Firebase Google Sign-In
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

  const handleSubmit = async (e) => {
    e.preventDefault();
     if (!requireFirebase()) return;

    setLoading(true);
    setError("");
    try {
      await setPersistence(auth, browserLocalPersistence);

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Update display name
      await updateProfile(userCredential.user, { displayName: fullName });

      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1>Create Your Account</h1>
      <p className="subtitle">Start building your professional resume today</p>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      {/* Google signup */}
      <button type="button" className="google-btn" onClick={handleGoogleSignIn} disabled={loading}>
        {loading ? "Signing in..." : "Continue with Google"}
      </button>

      <div className="divider">
        <span>Or continue with email</span>
      </div>

      <label htmlFor="fullName">Full Name</label>
      <input
        type="text"
        id="fullName"
        placeholder="John Doe"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
      />

      <label htmlFor="email">Email</label>
      <input
        type="email"
        id="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label htmlFor="password">Password</label>
      <input
        type="password"
        id="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />
      <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "-0.5rem", marginBottom: "1rem" }}>
        Must be at least 8 characters long
      </p>

      <div className="terms">
        <input type="checkbox" id="terms" required />
        <label htmlFor="terms">
          I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>
        </label>
      </div>

      <button type="submit" disabled={loading}>
        {loading ? "Creating account..." : "Create Account"}
      </button>

      <p className="auth-footer">
        Already have an account? <Link to="/auth/login">Sign in</Link>
      </p>
    </form>
  );
}
