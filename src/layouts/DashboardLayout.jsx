import { NavLink, Outlet } from "react-router-dom";
import "./DashboardLayout.css";

export default function DashboardLayout() {
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">✦</div>
          ResumeAI
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" end className="sidebar-link">
            <span className="nav-icon">▢</span>
            Dashboard
          </NavLink>
          <NavLink to="/dashboard/resume/new" className="sidebar-link">
            <span className="nav-icon">📝</span>
            Create Resume
          </NavLink>
          <NavLink to="/dashboard/cover-letter/new" className="sidebar-link">
            <span className="nav-icon">✉️</span>
            Create Cover Letter
          </NavLink>
          <NavLink to="/payment" className="sidebar-link">
            <span className="nav-icon">💎</span>
            Premium
          </NavLink>
          <NavLink to="/settings" className="sidebar-link">
            <span className="nav-icon">⚙️</span>
            Settings
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          Keep your documents fresh by revisiting them weekly for quick updates.
        </div>
      </aside>
      <div className="dashboard-main">
        <div className="dashboard-topbar">
          <div className="user-chip">
            <div className="user-avatar">JD</div>
            <div className="user-details">
              <span className="user-name">John Doe</span>
              <span className="user-plan">Free Plan</span>
            </div>
          </div>
        </div>
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
