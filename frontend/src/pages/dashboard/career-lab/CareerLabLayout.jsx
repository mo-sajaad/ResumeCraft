import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  FaArrowRight,
  FaBullseye,
  FaCheckCircle,
  FaChevronDown,
  FaChevronUp,
  FaFlask,
  FaLock,
} from "react-icons/fa";

import Button from "../../../components/ui/Button";
import { useAuth } from "../../../context/useAuth";
import { authFetch } from "../../../utils/auth";
import {
  CAREER_LAB_TOOLS,
  hasPlanAccess,
  TOOL_CATEGORIES,
} from "./careerLabTools";
import "../DashboardShared.css";
import "../CareerLab.css";

function resolveCareerToolEndpoint(endpoint) {
  if (!endpoint) return endpoint;
  if (/^https?:\/\//.test(endpoint)) return endpoint;

  const configuredBase = (import.meta.env.VITE_API_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (configuredBase) {
    return `${configuredBase}${endpoint}`;
  }

  if (
    import.meta.env.DEV &&
    window.location.hostname === "localhost" &&
    window.location.port === "5173"
  ) {
    return `http://localhost:5000${endpoint}`;
  }

  return endpoint;
}

export default function CareerLabLayout() {
  const location = useLocation();
  const { profile } = useAuth();
  const activePlanCode = (profile?.plan_code || "free").toLowerCase();

  const [results, setResults] = useState({});
  const [running, setRunning] = useState({});
  const [error, setError] = useState("");
  const [openGroupIds, setOpenGroupIds] = useState(() =>
    TOOL_CATEGORIES.map((category) => category.id),
  );

  const groupedTools = useMemo(
    () =>
      TOOL_CATEGORIES.map((category) => ({
        ...category,
        tools: CAREER_LAB_TOOLS.filter((tool) => tool.category === category.id),
      })),
    [],
  );

  const progress = useMemo(() => {
    const total = CAREER_LAB_TOOLS.length;
    const completed = CAREER_LAB_TOOLS.filter((tool) =>
      Boolean(results[tool.id]),
    ).length;
    return { completed, total };
  }, [results]);

  const interviewPrepPath = "/dashboard/career-lab/tools/interview-prep";
  const isInterviewPrepOpen = location.pathname === interviewPrepPath;

  const toggleGroup = (groupId) => {
    setOpenGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

  const toggleAllGroups = () => {
    setOpenGroupIds((prev) =>
      prev.length === TOOL_CATEGORIES.length
        ? []
        : TOOL_CATEGORIES.map((category) => category.id),
    );
  };

  const runTool = async (tool, payloadInputs = {}) => {
    const endpoint = resolveCareerToolEndpoint(tool.endpoint);

    setRunning((prev) => ({ ...prev, [tool.id]: true }));
    setError("");

    try {
      const response = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tool.payload(payloadInputs)),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            `Endpoint not found for ${tool.title}. Check backend route mounting or VITE_API_BASE_URL.`,
          );
        }
        throw new Error(data?.error || `Failed to run ${tool.title}.`);
      }

      setResults((prev) => ({ ...prev, [tool.id]: data }));
    } catch (err) {
      setError(err.message || `Unable to run ${tool.title}.`);
      throw err;
    } finally {
      setRunning((prev) => ({ ...prev, [tool.id]: false }));
    }
  };

  const contextValue = {
    results,
    running,
    runTool,
    error,
    setError,
    progress,
  };

  return (
    <div className="career-lab-page">
      <section className="career-lab-hero content-card">
        <div>
          <p className="career-lab-eyebrow">Career Lab</p>
          <h1 className="page-title">AI-Powered Career Command Center</h1>
          <p className="career-lab-hero-description">
            Every tool has dedicated inputs and output so you can run focused
            checks, compare results, and move step-by-step through your job
            search workflow.
          </p>
        </div>
        <div className="career-lab-metrics">
          <div className="career-lab-metric">
            <FaCheckCircle />
            <div>
              <strong>
                {progress.completed}/{progress.total}
              </strong>
              <span>tools completed</span>
            </div>
          </div>
          <div className="career-lab-metric">
            <FaBullseye />
            <div>
              <strong>
                {Math.max(progress.total - progress.completed, 0)}
              </strong>
              <span>tools remaining</span>
            </div>
          </div>
        </div>
      </section>

      {error ? <div className="content-card error-message">{error}</div> : null}

      <section className="content-card career-lab-top-nav-wrapper">
        <div className="career-lab-group-header">
          <h2>Feature Pages</h2>
          <div className="career-lab-top-actions">
            <span className="career-lab-top-actions-copy">
              Move from analysis to action
            </span>
            <button
              type="button"
              className="career-lab-toggle-all"
              onClick={toggleAllGroups}
            >
              {openGroupIds.length === TOOL_CATEGORIES.length
                ? "Collapse all"
                : "Expand all"}
            </button>
          </div>
        </div>

        <div
          className="career-lab-groups-grid"
          role="navigation"
          aria-label="Career Lab Tool Navigation"
        >
          {groupedTools.map((group) => {
            const isOpen = openGroupIds.includes(group.id);
            return (
              <div key={group.id} className="career-lab-group-card">
                <button
                  className="career-lab-dropdown-trigger"
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                >
                  <span>{group.label}</span>
                  <span className="career-lab-group-meta">
                    {group.tools.length} tools{" "}
                    {isOpen ? <FaChevronUp /> : <FaChevronDown />}
                  </span>
                </button>
                {isOpen ? (
                  <div className="career-lab-dropdown-menu is-open">
                    {group.tools.map((tool) => {
                      const done = Boolean(results[tool.id]);
                      const hasAccess = hasPlanAccess(
                        activePlanCode,
                        tool.minimumPlan,
                      );
                      const minimumPlanLabel =
                        tool.minimumPlan.charAt(0).toUpperCase() +
                        tool.minimumPlan.slice(1);
                      return (
                        <NavLink
                          key={tool.id}
                          to={`/dashboard/career-lab/tools/${tool.id}`}
                          className="career-lab-tool-link"
                          aria-label={
                            !hasAccess
                              ? `${tool.title}, ${minimumPlanLabel} plan required`
                              : undefined
                          }
                        >
                          <span>{tool.title}</span>
                          {!hasAccess ? (
                            <small>{minimumPlanLabel}</small>
                          ) : null}
                          {!hasAccess ? (
                            <FaLock aria-hidden="true" />
                          ) : done ? (
                            <FaCheckCircle className="career-lab-tool-done" />
                          ) : (
                            <FaArrowRight className="career-lab-tool-arrow" />
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="content-card career-lab-inputs">
        <div className="career-lab-group-header">
          <h3>Start a Tool Flow</h3>
          <span className="career-lab-group-subtext">
            Open any tool for focused inputs + result output
          </span>
        </div>
        <div className="career-lab-diagnostic-flow">
          <p>
            <strong>Diagnostic flow:</strong> Start with ATS Analysis to
            identify gaps, then move to matching and rewrite tools to improve
            weak sections before interview prep.
          </p>
          <ol className="career-lab-diagnostic-steps">
            <li>
              <strong>Run ATS Analysis</strong> with your resume + job
              description.
            </li>
            <li>
              <strong>Review the output</strong> and pick the next tool based on
              missing keywords, weak bullets, or role-fit gaps.
            </li>
            <li>
              <strong>Apply improvements</strong> in rewrite tools, then re-run
              diagnostics to confirm progress.
            </li>
          </ol>
        </div>
        <div className="career-lab-cta-row">
          <Button as={NavLink} to="/dashboard/career-lab/tools/ats-analysis">
            <FaFlask /> Start Diagnostic Flow
          </Button>
          <Button
            as={NavLink}
            to={interviewPrepPath}
            variant="secondary"
            aria-current={isInterviewPrepOpen ? "page" : undefined}
          >
            <FaBullseye />{" "}
            {isInterviewPrepOpen
              ? "Interview Prep Open"
              : "Jump to Interview Prep"}
          </Button>
        </div>
      </section>

      <Outlet context={contextValue} />
    </div>
  );
}
