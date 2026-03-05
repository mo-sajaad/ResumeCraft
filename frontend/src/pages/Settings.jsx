import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes";
import { auth, sendPasswordResetEmail, updatePassword } from "../firebase";

import "./dashboard/DashboardPages.css";

export default function Settings() {
  const { user, profile, logout } = useAuth(); // now includes profile from DB
  const navigate = useNavigate();

  const [weeklyInsightsEnabled, setWeeklyInsightsEnabled] = useState(false);
  const [jobAlertsEnabled, setJobAlertsEnabled] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [isSaving, setIsSaving] = useState(false);

  const joinedDate = useMemo(() => {
    if (!user?.metadata?.creationTime) return "Not available";
    const date = new Date(user.metadata.creationTime);
    return Number.isNaN(date.valueOf()) ? "Not available" : date.toLocaleDateString();
  }, [user]);

  const handleLogout = async () => {
    await logout?.();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  const setSuccess = (message) => setFeedback({ type: "success", message });
  const setError = (message) => setFeedback({ type: "error", message });

  const handleSaveChanges = async () => {
    setFeedback({ type: "", message: "" });

    if (!newPassword && !confirmPassword) {
      setSuccess("Preferences saved.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!auth?.currentUser) {
      setError("No authenticated user found.");
      return;
    }

    setIsSaving(true);

    try {
      await updatePassword(auth.currentUser, newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Preferences and password updated successfully.");
    } catch (error) {
      if (error?.code === "auth/requires-recent-login") {
        setError("Please log in again before changing your password.");
      } else {
        setError(error?.message || "Failed to update password.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setFeedback({ type: "", message: "" });

    if (!user?.email) {
      setError("No email is available for this account.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, user.email);
      setSuccess("Password reset email sent.");
    } catch (error) {
      setError(error?.message || "Failed to send reset email.");
    }
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
        {/* Profile Card */}
        <div className="content-card">
          <h3>Profile</h3>
          <div className="input-grid">
            <div className="input-group form-padding">
              <label htmlFor="full-name">Full name</label>
              <input
                id="full-name"
                placeholder="John Doe"
                value={profile?.full_name || ""}
                readOnly
              />
            </div>
            <div className="input-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                placeholder="john.doe@email.com"
                value={profile?.email || user?.email || ""}
                readOnly
              />
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="headline">Account created</label>
            <input id="headline" value={joinedDate} readOnly />
          </div>
        </div>

        {/* Preferences Card */}
        <div className="content-card">
          <h3>Preferences</h3>
          <div className="form-stack">
            <div className="preference-toggle">
              <span>Weekly insights</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={weeklyInsightsEnabled}
                  onChange={(e) => setWeeklyInsightsEnabled(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
            </div>
            <div className="preference-toggle">
              <span>Job alerts</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={jobAlertsEnabled}
                  onChange={(e) => setJobAlertsEnabled(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        {/* Security Card */}
        <div className="content-card">
          <h3>Security</h3>
          <div className="input-grid">
            <div className="input-group">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        </div>

        {feedback.message && (
          <p className={`settings-feedback settings-feedback--${feedback.type || "success"}`}>
            {feedback.message}
          </p>
        )}

        {/* Actions */}
        <div className="header-actions">
          <button
            className="btn btn-dark"
            type="button"
            onClick={handleSaveChanges}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleResetPassword}>
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