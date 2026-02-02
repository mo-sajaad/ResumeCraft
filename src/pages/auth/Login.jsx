import { useState } from "react";
import { Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // Firebase login logic later
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1>Welcome Back</h1>
      <p className="subtitle">
        Sign in to continue building your resume
      </p>

      <button type="button" className="google-btn">
        Continue with Google
      </button>

      <div className="divider">
        <span>Or continue with email</span>
      </div>

      <label>Email</label>
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label>Password</label>
      <input
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <div className="options">
        <div className="remember">
          <input type="checkbox" />
          Remember me
        </div>
        <Link to="/auth/forgot-password">Forgot password?</Link>
      </div>

      <button type="submit">Sign In</button>

      <div className="auth-footer">
        Don&apos;t have an account? <Link to="/auth/signup">Sign up</Link>
      </div>
    </form>
  );
}
