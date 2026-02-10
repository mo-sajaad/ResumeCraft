import { Link } from "react-router-dom";
import "./Home.css"

export default function Home() {
  return (
    <div>
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <h1>Welcome to the App!</h1>
        <p>This is the home page. Everything should render correctly if routing works.</p>

        <div style={{ marginTop: "2rem" }}>
          <Link
            to="/auth/login"
            style={{
              display: "inline-block",
              margin: "0.5rem",
              padding: "0.5rem 1rem",
              backgroundColor: "#2563eb",
              color: "#fff",
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            Login
          </Link>

          <Link
            to="/auth/signup"
            style={{
              display: "inline-block",
              margin: "0.5rem",
              padding: "0.5rem 1rem",
              backgroundColor: "#16a34a",
              color: "#fff",
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            Sign Up
          </Link>
        </div>

        <div style={{ marginTop: "2rem" }}>
          <Link
            to="/dashboard"
            style={{ color: "#2563eb", textDecoration: "underline" }}
          >
            Go to Dashboard
          </Link>
        </div>
      </div>

      <div className="navbar">
        <div className="logo">

        </div>
        <div className="navbar-buttons">
          <button className="btn btn-outline">Sign In</button>
          <button>Get Started</button>
        </div>
      </div>
      <div className="hero">

      </div>
    </div>
  );
}
