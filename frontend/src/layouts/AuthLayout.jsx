import { Link, Outlet, useLocation } from "react-router-dom";
import { FaCheckCircle, FaFileAlt, FaShieldAlt, FaWandMagicSparkles } from "react-icons/fa6";

import "./AuthLayout.css";

const BENEFITS = [
  {
    icon: <FaWandMagicSparkles />,
    title: "AI-Guided Writing",
    text: "Generate strong bullets and polished summaries in seconds.",
  },
  {
    icon: <FaFileAlt />,
    title: "ATS-Friendly Templates",
    text: "Use recruiter-trusted layouts built for modern applicant systems.",
  },
  {
    icon: <FaShieldAlt />,
    title: "Secure Workspace",
    text: "Your profile and documents stay private inside your account.",
  },
];

export default function AuthLayout() {
  const location = useLocation();
  const isSignup = location.pathname.includes("/signup");

  return (
    <div className="auth-shell">
      <aside className="auth-brand-panel">
        <Link to="/" className="auth-logo-link">
          <span className="auth-logo-mark">◆</span>
          <span>ResumeCraft</span>
        </Link>

        <p className="auth-kicker">Career Platform</p>
        <h1>{isSignup ? "Build your next opportunity." : "Welcome back to your workspace."}</h1>
        <p className="auth-hero-copy">
          {isSignup
            ? "Create your account to generate resumes, cover letters, and execute a complete job-search strategy."
            : "Pick up where you left off and keep your job-search assets moving forward."}
        </p>

        <div className="auth-benefits">
          {BENEFITS.map((benefit) => (
            <article key={benefit.title} className="auth-benefit-card">
              <span className="auth-benefit-icon">{benefit.icon}</span>
              <div>
                <h3>{benefit.title}</h3>
                <p>{benefit.text}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="auth-proof"><FaCheckCircle /> Trusted by professionals building better applications.</p>
      </aside>

      <main className="auth-form-panel">
        <div className="auth-form-wrapper">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
