import { Outlet } from "react-router-dom";
import "./AuthLayout.css"

export default function AuthLayout() {
  return (
    <div className="container">
      <div className="left panel">
        {/* Logo / Name */}
        <div className="logo">Resume Craft</div>

        {/* Main Text */}
        <div className="main-text">
          <h2>Create Your Dream Resume in Minutes</h2>
          <p>
            Join over 1 million professionals who have landed their dream jobs
            with AI-powered resumes.
          </p>

          {/* Features / bullet points */}
          <ul className="features">
            <li>AI-Powered Content — Smart suggestions for every section</li>
            <li>ATS Optimized — Pass all applicant tracking systems</li>
            <li>Professional Templates — Beautiful, recruiter-approved designs</li>
          </ul>
        </div>
      </div>
      <div className="right panel">
        <Outlet />
      </div>
    </div>
  );
}
