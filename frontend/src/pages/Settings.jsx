import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes";
import { auth, sendPasswordResetEmail, updatePassword } from "../firebase";
import { getAuthHeaders, signOutOtherSessions } from "../utils/auth";

import "./dashboard/DashboardShared.css";

// The preferences stored in a profile, as sent to the API.
const savedPreferencesOf = (profile) => ({
  weeklyInsights: Boolean(profile?.weekly_insights ?? profile?.weeklyInsights),
  jobAlerts: Boolean(profile?.job_alerts ?? profile?.jobAlerts),
});

export default function Settings() {
  const { user, profile, logout, patchProfile } = useAuth(); // now includes profile from DB
  const navigate = useNavigate();

  const [weeklyInsightsEnabled, setWeeklyInsightsEnabled] = useState(false);
  const [jobAlertsEnabled, setJobAlertsEnabled] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const saved = savedPreferencesOf(profile);
    setWeeklyInsightsEnabled(saved.weeklyInsights);
    setJobAlertsEnabled(saved.jobAlerts);
  }, [profile]);

  const joinedDate = useMemo(() => {
    if (!user?.metadata?.creationTime) return "Not available";
    const date = new Date(user.metadata.creationTime);
    return Number.isNaN(date.valueOf()) ? "Not available" : date.toLocaleDateString();
  }, [user]);

  const setSuccess = (message) => setFeedback({ type: "success", message });
  const setError = (message) => setFeedback({ type: "error", message });

  const handleLogout = async () => {
    try {
      await logout?.();
    } catch {
      // Signed out of Firebase: the sign-in page explains a server failure (IDENTITY-012).
      if (auth?.currentUser) {
        setError("You could not be signed out. Check your connection, then try again.");
        return;
      }
    }
    navigate(ROUTES.LOGIN, { replace: true });
  };

  // Only the preferences that differ from the loaded profile (IDENTITY-013).
  const changedPreferences = () => {
    if (!profile) return {};
    const saved = savedPreferencesOf(profile);
    const changes = {};
    if (weeklyInsightsEnabled !== saved.weeklyInsights) changes.weeklyInsights = weeklyInsightsEnabled;
    if (jobAlertsEnabled !== saved.jobAlerts) changes.jobAlerts = jobAlertsEnabled;
    return changes;
  };

  const savePreferences = async (changes) => {
    if (!user?.uid) {
      throw new Error("No authenticated user found.");
    }

    const headers = await getAuthHeaders({ "Content-Type": "application/json" });

    const response = await fetch(`/api/users/${user.uid}/preferences`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(changes),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || "Failed to save preferences.");
    }

    // Reopening Settings must show what was saved, not the old profile.
    const next = { ...savedPreferencesOf(profile), ...changes };
    patchProfile?.(user.uid, {
      weekly_insights: data?.weekly_insights ?? next.weeklyInsights,
      job_alerts: data?.job_alerts ?? next.jobAlerts,
    });
  };

  // Checked before anything is saved, so an invalid password saves nothing.
  const passwordError = () => {
    if (newPassword.length < 6) return "Password must be at least 6 characters long.";
    if (newPassword !== confirmPassword) return "Passwords do not match.";
    if (!auth?.currentUser) return "No authenticated user found.";
    return null;
  };

  const handleSaveChanges = async () => {
    setFeedback({ type: "", message: "" });

    const changesPassword = Boolean(newPassword || confirmPassword);
    const invalidPassword = changesPassword ? passwordError() : null;
    if (invalidPassword) {
      setError(invalidPassword);
      return;
    }

    setIsSaving(true);

    try {
      const changes = changedPreferences();
      if (Object.keys(changes).length > 0) await savePreferences(changes);

      if (!changesPassword) {
        setSuccess("Preferences saved.");
        return;
      }

      await updatePassword(auth.currentUser, newPassword);
      setNewPassword("");
      setConfirmPassword("");

      try {
        await signOutOtherSessions();
      } catch {
        setError("Your password was changed, but other devices could not be signed out. Log out, then sign in again.");
        return;
      }
      setSuccess("Preferences and password updated successfully.");
    } catch (error) {
      if (error?.code === "auth/requires-recent-login") {
        setError("Please log in again before changing your password.");
      } else {
        setError(error?.message || "Failed to update settings.");
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
                  disabled={!profile || isSaving}
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
                  disabled={!profile || isSaving}
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
            aria-busy={isSaving}
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