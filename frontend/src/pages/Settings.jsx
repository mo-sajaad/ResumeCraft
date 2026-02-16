import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes";

import "./dashboard/DashboardPages.css";

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const joinedDate = useMemo(() => {
    if (!user?.metadata?.creationTime) return "Not available";
    const date = new Date(user.metadata.creationTime);
    return Number.isNaN(date.valueOf()) ? "Not available" : date.toLocaleDateString();
  }, [user]);

  const handleLogout = async () => {
    await logout?.();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your profile, preferences, and security settings.</p>
        </div>
      </div>

      <div className="form-stack">
        <div className="content-card">
          <h3>Profile</h3>
          <div className="input-grid">
            <div className="input-group form-padding">
              <label htmlFor="full-name">Full name</label>
              <input
                id="full-name"
                placeholder="John Doe"
                value={user?.displayName || ""}
                readOnly
              />
            </div>
            <div className="input-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                placeholder="john.doe@email.com"
                value={user?.email || ""}
                readOnly
              />
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="headline">Account created</label>
            <input id="headline" value={joinedDate} readOnly />
          </div>
        </div>

        <div className="content-card">
          <h3>Preferences</h3>
          <div className="form-stack">
            <label className="preference-toggle">
              Weekly insights
              <label className="switch">
                <input type="checkbox" />
                <span className="slider round"></span>
              </label>
            </label>
            <label className="preference-toggle">
              Job alerts
              <label className="switch">
                <input type="checkbox" />
                <span className="slider round"></span>
              </label>
            </label>
          </div>
        </div>

        <div className="content-card">
          <h3>Security</h3>
          <div className="input-grid">
            <div className="input-group">
              <label htmlFor="password">New password</label>
              <input id="password" type="password" placeholder="••••••••" />
            </div>
            <div className="input-group">
              <label htmlFor="confirm-password">Confirm password</label>
              <input id="confirm-password" type="password" placeholder="••••••••" />
            </div>
          </div>
        </div>

        <div className="header-actions">
          <button className="btn btn-dark" type="button">
            Save changes
          </button>
          <button className="btn btn-outline" type="button">
            Reset password
          </button>
          <button className="btn btn-outline" type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
