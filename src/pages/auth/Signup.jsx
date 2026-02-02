import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../../firebase";
import { useAuth } from "../../context/useAuth";

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

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
      {/* Titles */}
      <h1>Create Your Account</h1>
      <p className="subtitle">Start building your professional resume today</p>

      {/* Error */}
      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      {/* Google signup */}
      <button type="button" className="google-btn">
        Continue with Google
      </button>

      {/* Divider */}
      <div className="divider">
        <span>Or continue with email</span>
      </div>

      {/* Full Name */}
      <label htmlFor="fullName">Full Name</label>
      <input
        type="text"
        id="fullName"
        placeholder="John Doe"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
      />

      {/* Email */}
      <label htmlFor="email">Email</label>
      <input
        type="email"
        id="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      {/* Password */}
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

      {/* Terms */}
      <div className="terms">
        <input type="checkbox" id="terms" required />
        <label htmlFor="terms">
          I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>
        </label>
      </div>


      {/* Submit */}
      <button type="submit" disabled={loading}>
        {loading ? "Creating account..." : "Create Account"}
      </button>

      {/* Footer */}
      <p className="auth-footer">
        Already have an account? <Link to="/auth/login">Sign in</Link>
      </p>
    </form>
  );
}
