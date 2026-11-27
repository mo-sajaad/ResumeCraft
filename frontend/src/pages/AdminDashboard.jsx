import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/useAuth";
import { authFetch } from "../utils/auth";
import "./dashboard/DashboardShared.css";
import Button from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/LoadingState";

const USAGE_DAYS = 14;
const IDLE = { status: "loading", data: null, error: "" };

// The server's reason when it gives one (for example a disabled admin_dashboard flag).
async function failureMessage(response, fallback) {
  const body = await response.json().catch(() => null);
  return body?.error || body?.message || `${fallback} (HTTP ${response.status}).`;
}

// One panel's request, so a failure in one does not hide the others (ADMIN-013).
function usePanel(url, pick, enabled) {
  const [state, setState] = useState(IDLE);

  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, status: "loading", error: "" }));
    try {
      const response = await authFetch(url);
      if (!response.ok) throw new Error(await failureMessage(response, "Request failed"));
      setState({ status: "ready", data: pick(await response.json()), error: "" });
    } catch (err) {
      setState({ status: "error", data: null, error: err.message || "Request failed." });
    }
  }, [url, pick]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return [state, load, setState];
}

const pickFlags = (json) => json.flags || [];
const pickUsage = (json) => ({
  events: json.events || [],
  truncated: Boolean(json.truncated),
  totalEvents: Number(json.totalEvents || 0),
});
const pickLogs = (json) => json.logs || [];

function Panel({ title, state, onRetry, isEmpty, emptyText, children }) {
  let body;
  if (state.status === "loading" && !state.data) body = <LoadingState rows={4} />;
  else if (state.status === "error") {
    body = (
      <ErrorState
        title={`Could not load ${title.toLowerCase()}`}
        description={state.error}
        action={<Button variant="secondary" onClick={onRetry}>Retry</Button>}
      />
    );
  } else if (isEmpty(state.data)) body = <p className="page-subtitle">{emptyText}</p>;
  else body = children(state.data);

  return (
    <section className="content-card" aria-busy={state.status === "loading"}>
      <h2>{title}</h2>
      {body}
    </section>
  );
}

export default function AdminDashboard() {
  const { profile, sessionStatus, retrySession } = useAuth();
  const isAdmin = Boolean(profile?.is_admin);

  const [flagsState, loadFlags, setFlagsState] = usePanel("/api/admin/feature-flags", pickFlags, isAdmin);
  const [usageState, loadUsage] = usePanel(`/api/admin/analytics/usage?days=${USAGE_DAYS}`, pickUsage, isAdmin);
  const [auditState, loadAudit] = usePanel("/api/admin/audit-logs?limit=50", pickLogs, isAdmin);
  const [pendingKey, setPendingKey] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const toggleFlag = async (flag) => {
    const next = !flag.enabled;
    const warning = flag.key === "admin_dashboard" && !next
      ? "\n\nUsage analytics and audit logs on this page stop loading until it is turned back on. Feature flags stay available."
      : "";
    if (!window.confirm(`${next ? "Turn on" : "Turn off"} ${flag.key}?${warning}`)) return;

    setPendingKey(flag.key);
    setFeedback(null);
    try {
      // Only `enabled`, so the stored rollout is kept (ADMIN-006).
      const response = await authFetch(`/api/admin/feature-flags/${encodeURIComponent(flag.key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) throw new Error(await failureMessage(response, `Could not update ${flag.key}`));

      const { flag: updated } = (await response.json().catch(() => null)) || {};
      if (updated?.key) {
        setFlagsState((previous) => ({
          ...previous,
          data: (previous.data || []).map((item) => (item.key === updated.key ? { ...item, ...updated } : item)),
        }));
      } else {
        await loadFlags();
      }
      setFeedback({ type: "success", text: `${flag.key} is now ${next ? "on" : "off"}.` });
      loadAudit();
    } catch (err) {
      setFeedback({ type: "error", text: err.message || `Could not update ${flag.key}.` });
    } finally {
      setPendingKey(null);
    }
  };

  if (sessionStatus === "loading" && !profile) {
    return (
      <section className="content-card">
        <h1 className="page-title">Admin Dashboard</h1>
        <LoadingState rows={2} />
      </section>
    );
  }

  // A failed profile load is not the same as "not an admin" (ADMIN-013).
  if (sessionStatus === "error" && !profile) {
    return (
      <section className="content-card">
        <h1 className="page-title">Admin Dashboard</h1>
        <ErrorState
          title="Could not check your access"
          description="Your profile could not be loaded."
          action={retrySession ? <Button variant="secondary" onClick={retrySession}>Retry</Button> : null}
        />
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="content-card">
        <h1 className="page-title">Admin Dashboard</h1>
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

      <Panel
        title="Feature Flags"
        state={flagsState}
        onRetry={loadFlags}
        isEmpty={(flags) => flags.length === 0}
        emptyText="No feature flags are defined."
      >
        {(flags) => (
          <>
            {feedback ? (
              <p
                className={`settings-feedback settings-feedback--${feedback.type}`}
                role={feedback.type === "error" ? "alert" : "status"}
              >
                {feedback.text}
              </p>
            ) : null}
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
                      <td>{flag.enabled ? "On" : "Off"}</td>
                      <td>{flag.rollout_percent}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => toggleFlag(flag)}
                          disabled={pendingKey !== null}
                          aria-label={`${flag.enabled ? "Turn off" : "Turn on"} ${flag.key}`}
                        >
                          {pendingKey === flag.key ? "Saving…" : flag.enabled ? "Turn off" : "Turn on"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title={`Usage Analytics (${USAGE_DAYS}d)`}
        state={usageState}
        onRetry={loadUsage}
        isEmpty={(usage) => usage.events.length === 0}
        emptyText={`No usage recorded in the last ${USAGE_DAYS} days.`}
      >
        {(usage) => (
          <>
            <p className="page-subtitle">
              {`${usage.totalEvents} events in total.`}
              {usage.truncated ? ` Showing the ${usage.events.length} busiest routes.` : ""}
            </p>
            <ol>
              {usage.events.map((event) => (
                <li key={`${event.route}::${event.event_type}`}>
                  <strong>{`${event.route || "(no route)"} · ${event.event_type}`}</strong>: {event.count}
                </li>
              ))}
            </ol>
          </>
        )}
      </Panel>

      <Panel
        title="Recent Audit Logs"
        state={auditState}
        onRetry={loadAudit}
        isEmpty={(logs) => logs.length === 0}
        emptyText="No audit entries yet."
      >
        {(logs) => (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th></tr>
              </thead>
              <tbody>
                {logs.map((log) => (
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
      </Panel>
    </div>
  );
}
