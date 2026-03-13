import { useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { FaCog, FaGem, FaRegAddressCard, FaRegEnvelope, FaTh } from "react-icons/fa";

import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes";

import "./DashboardLayout.css";

const getInitials = (name, email) => {
  const source = name?.trim() || email?.split("@")[0] || "";
  if (!source) return "U";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

export default function DashboardLayout() {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();

  const userDisplayName = useMemo(() => user?.displayName?.trim() || user?.email || "Guest User", [user]);
  const userInitials = useMemo(() => getInitials(userDisplayName), [userDisplayName]);
  const planLabel = useMemo(() => {
    const code = (profile?.plan_code || "free").toLowerCase();
    return `${code.charAt(0).toUpperCase()}${code.slice(1)} Plan`;
  }, [profile?.plan_code]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout?.();
      navigate(ROUTES.LOGIN, { replace: true });
    } finally {
      setIsLoggingOut(false);
      setDropdownVisible(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">✦</div>
          ResumeCraft
        </div>

        <nav className="sidebar-nav">
          <NavLink to={ROUTES.DASHBOARD} end className="sidebar-link">
            <span className="nav-icon"><FaTh /></span>
            Dashboard
          </NavLink>
          <NavLink to={ROUTES.RESUME_NEW} className="sidebar-link">
            <span className="nav-icon"><FaRegAddressCard /></span>
            Create Resume
          </NavLink>
          <NavLink to={ROUTES.COVERLETTER_NEW} className="sidebar-link">
            <span className="nav-icon"><FaRegEnvelope /></span>
            Create Cover Letter
          </NavLink>

          <div className="sidebar-section-label">Career Lab</div>
          <NavLink to={ROUTES.CAREER_LAB} end className="sidebar-link sidebar-sublink">Overview</NavLink>
          <NavLink to={ROUTES.CAREER_LAB_ATS} className="sidebar-link sidebar-sublink">ATS Tool</NavLink>
          <NavLink to={ROUTES.CAREER_LAB_ROLE_FIT} className="sidebar-link sidebar-sublink">Role Fit Tool</NavLink>
          <NavLink to={ROUTES.CAREER_LAB_INTERVIEW_PREP} className="sidebar-link sidebar-sublink">Interview Prep Tool</NavLink>

          <NavLink to={ROUTES.PAYMENT} className="sidebar-link">
            <span className="nav-icon"><FaGem /></span>
            Premium
          </NavLink>
          <NavLink to={ROUTES.SETTINGS} className="sidebar-link">
            <span className="nav-icon"><FaCog /></span>
            Settings
          </NavLink>
        </nav>

        <div className="sidebar-footer">Use Career Lab pages one by one to run focused analysis instead of one giant form.</div>
      </aside>

      <div className="dashboard-main">
        <div className="dashboard-topbar">
          <div className="user-chip" onClick={() => setDropdownVisible((p) => !p)} role="button" tabIndex={0}>
            <div className="user-avatar">{userInitials}</div>
            <div className="user-details">
              <span className="user-name">{profile?.full_name || userDisplayName}</span>
              <span className="user-plan">{planLabel}</span>
            </div>
            {dropdownVisible && (
              <div className="user-dropdown">
                <ul>
                  <li><NavLink to={ROUTES.SETTINGS} className="dropdown-link">Profile</NavLink></li>
                  <li><NavLink to={ROUTES.SETTINGS} className="dropdown-link">Settings</NavLink></li>
                  <li>
                    <button type="button" className="dropdown-link" onClick={handleLogout} disabled={isLoggingOut}>
                      {isLoggingOut ? "Logging out..." : "Log Out"}
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
