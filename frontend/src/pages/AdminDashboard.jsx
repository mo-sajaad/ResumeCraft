import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/useAuth";
import { getAuthHeaders } from "../utils/auth";
import "./dashboard/DashboardShared.css";
import { LoadingState } from "../components/ui/LoadingState";

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [flags, setFlags] = useState([]);
  const [usage, setUsage] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isAdmin = Boolean(profile?.is_admin);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const [flagsRes, usageRes, auditRes] = await Promise.all([
        fetch("/api/admin/feature-flags", { headers }),
        fetch("/api/admin/analytics/usage?days=14", { headers }),
        fetch("/api/admin/audit-logs?limit=50", { headers }),
      ]);

      if (!flagsRes.ok || !usageRes.ok || !auditRes.ok) {
        throw new Error("Failed to load admin dashboard data.");
      }

      const flagsJson = await flagsRes.json();
      const usageJson = await usageRes.json();
      const auditJson = await auditRes.json();

      setFlags(flagsJson.flags || []);
      setUsage(usageJson.events || []);
      setAuditLogs(auditJson.logs || []);
    } catch (err) {
      setError(err.message || "Unable to load admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const usageSummary = useMemo(() => {
    return usage.reduce((acc, event) => {
      const key = `${event.route}::${event.event_type}`;
      acc[key] = (acc[key] || 0) + Number(event.count || 0);
      return acc;
    }, {});
  }, [usage]);

  const toggleFlag = async (flag) => {
    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const response = await fetch(`/api/admin/feature-flags/${encodeURIComponent(flag.key)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ enabled: !flag.enabled, rolloutPercent: flag.rollout_percent }),
      });

      if (!response.ok) throw new Error("Failed to update feature flag");
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to update feature flag.");
    }
  };

  if (!isAdmin) {
    return (
      <section className="content-card">
        <h2>Admin Dashboard</h2>
        <p className="page-subtitle">You do not have permission to access admin systems.</p>
      </section>
    );
  }

  return (
    <div className="content-section">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">Feature flags, audit logs, and usage analytics.</p>
        </div>
      </div>

      {error ? <div className="content-card error-message">{error}</div> : null}

      <section className="content-card">
        <h3>Feature Flags</h3>
        {loading ? <LoadingState rows={4} /> : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr><th>Key</th><th>Description</th><th>Enabled</th><th>Rollout %</th><th>Action</th></tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <tr key={flag.key}>
                    <td>{flag.key}</td>
                    <td>{flag.description || "—"}</td>
                    <td>{String(flag.enabled)}</td>
                    <td>{flag.rollout_percent}</td>
                    <td><button className="btn btn-outline" onClick={() => toggleFlag(flag)}>Toggle</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="content-card">
        <h3>Usage Analytics (14d)</h3>
        {loading ? <LoadingState rows={4} /> : (
          <ul>
            {Object.entries(usageSummary).slice(0, 20).map(([key, count]) => (
              <li key={key}><strong>{key}</strong>: {count}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="content-card">
        <h3>Recent Audit Logs</h3>
        {loading ? <LoadingState rows={4} /> : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th></tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td>{log.actor_firebase_uid || "system"}</td>
                    <td>{log.action}</td>
                    <td>{`${log.resource_type || "-"}:${log.resource_id || "-"}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
