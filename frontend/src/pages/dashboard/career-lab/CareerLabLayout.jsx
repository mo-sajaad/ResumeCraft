import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  FaArrowRight,
  FaBullseye,
  FaCheckCircle,
  FaChevronDown,
  FaChevronUp,
  FaFlask,
  FaSearch,
} from "react-icons/fa";

import Button from "../../../components/ui/Button";
import { getAuthHeaders } from "../../../utils/auth";
import { CAREER_LAB_TOOLS, TOOL_CATEGORIES } from "./careerLabTools";
import "../CareerLab.css";

function countPopulatedInputs(inputs) {
  return Object.values(inputs).filter((value) => String(value || "").trim().length > 0).length;
}

function resolveCareerToolEndpoint(endpoint) {
  if (!endpoint) return endpoint;
  if (/^https?:\/\//.test(endpoint)) return endpoint;

  const configuredBase = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (configuredBase) {
    return `${configuredBase}${endpoint}`;
  }

  if (import.meta.env.DEV && window.location.hostname === "localhost" && window.location.port === "5173") {
    return `http://localhost:5000${endpoint}`;
  }

  return endpoint;
}

export default function CareerLabLayout() {
  const location = useLocation();

  const [inputs, setInputs] = useState({
    jobDescription: "",
    resumeText: "",
    benchmarkText: "",
    targetRole: "",
    targetLocation: "",
    yearsExperience: "",
    answerText: "",
  });

  const [results, setResults] = useState({});
  const [running, setRunning] = useState({});
  const [error, setError] = useState("");
  const [openGroupIds, setOpenGroupIds] = useState(() => TOOL_CATEGORIES.map((category) => category.id));

  const groupedTools = useMemo(
    () => TOOL_CATEGORIES.map((category) => ({
      ...category,
      tools: CAREER_LAB_TOOLS.filter((tool) => tool.category === category.id),
    })),
    []
  );

  const progress = useMemo(() => {
    const total = CAREER_LAB_TOOLS.length;
    const completed = CAREER_LAB_TOOLS.filter((tool) => Boolean(results[tool.id])).length;
    const inputCoverage = countPopulatedInputs(inputs);
    return { completed, total, inputCoverage };
  }, [results, inputs]);

  const interviewPrepPath = "/dashboard/career-lab/tools/interview-prep";
  const isInterviewPrepOpen = location.pathname === interviewPrepPath;

  const toggleGroup = (groupId) => {
    setOpenGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  };

  const toggleAllGroups = () => {
    setOpenGroupIds((prev) => (prev.length === TOOL_CATEGORIES.length ? [] : TOOL_CATEGORIES.map((category) => category.id)));
  };

  const runTool = async (tool, overrideInputs = null) => {
    const payloadInputs = overrideInputs || inputs;
    const endpoint = resolveCareerToolEndpoint(tool.endpoint);

    setRunning((prev) => ({ ...prev, [tool.id]: true }));
    setError("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(tool.payload(payloadInputs)),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Endpoint not found for ${tool.title}. Check backend route mounting or VITE_API_BASE_URL.`);
        }
        throw new Error(data?.error || `Failed to run ${tool.title}.`);
      }

      setResults((prev) => ({ ...prev, [tool.id]: data }));
      if (overrideInputs) {
        setInputs((prev) => ({ ...prev, ...overrideInputs }));
      }
    } catch (err) {
      setError(err.message || `Unable to run ${tool.title}.`);
      throw err;
    } finally {
      setRunning((prev) => ({ ...prev, [tool.id]: false }));
    }
  };

  const contextValue = {
    inputs,
    setInputs,
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
            Hybrid workflow: every tool has a dedicated input form, while optional shared defaults keep your repeated context in sync.
          </p>
        </div>
        <div className="career-lab-metrics">
          <div className="career-lab-metric">
            <FaCheckCircle />
            <div>
              <strong>{progress.completed}/{progress.total}</strong>
              <span>tools completed</span>
            </div>
          </div>
          <div className="career-lab-metric">
            <FaSearch />
            <div>
              <strong>{progress.inputCoverage}/7</strong>
              <span>shared defaults set</span>
            </div>
          </div>
        </div>
      </section>

      {error ? <div className="content-card error-message">{error}</div> : null}

      <section className="content-card career-lab-top-nav-wrapper">
        <div className="career-lab-group-header">
          <h2>Feature Pages</h2>
          <div className="career-lab-top-actions">
            <span>Move from analysis to action</span>
            <button type="button" className="career-lab-toggle-all" onClick={toggleAllGroups}>
              {openGroupIds.length === TOOL_CATEGORIES.length ? "Collapse all" : "Expand all"}
            </button>
          </div>
        </div>

        <div className="career-lab-groups-grid" role="navigation" aria-label="Career Lab Tool Navigation">
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
                  <span className="career-lab-group-meta">{group.tools.length} tools {isOpen ? <FaChevronUp /> : <FaChevronDown />}</span>
                </button>
                {isOpen ? (
                  <div className="career-lab-dropdown-menu is-open">
                    {group.tools.map((tool) => {
                      const done = Boolean(results[tool.id]);
                      return (
                        <NavLink key={tool.id} to={`/dashboard/career-lab/tools/${tool.id}`} className="career-lab-tool-link">
                          <span>{tool.title}</span>
                          {done ? <FaCheckCircle className="career-lab-tool-done" /> : <FaArrowRight className="career-lab-tool-arrow" />}
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

      <details className="content-card career-lab-shared-defaults">
        <summary>
          <span>Shared Defaults (Optional)</span>
          <FaChevronDown />
        </summary>
        <p className="career-lab-tool-description">
          Tool pages load from these defaults first. You can still override inputs per tool before running.
        </p>
        <div className="career-lab-layout compact-grid">
          <section className="career-lab-panel">
            <label htmlFor="shared-role">Target Role</label>
            <input
              id="shared-role"
              className="career-lab-input"
              value={inputs.targetRole}
              onChange={(e) => setInputs((p) => ({ ...p, targetRole: e.target.value }))}
              placeholder="e.g. Senior Backend Engineer"
            />
          </section>

          <section className="career-lab-panel">
            <label htmlFor="shared-location">Target Location</label>
            <input
              id="shared-location"
              className="career-lab-input"
              value={inputs.targetLocation}
              onChange={(e) => setInputs((p) => ({ ...p, targetLocation: e.target.value }))}
              placeholder="e.g. London, UK"
            />
          </section>
        </div>
      </details>

      <section className="content-card career-lab-inputs">
        <div className="career-lab-group-header">
          <h3>Start a Tool Flow</h3>
          <span>Open any tool for focused inputs + result output</span>
        </div>
        <div className="career-lab-cta-row">
          <Button as={NavLink} to="/dashboard/career-lab/tools/ats-analysis">
            <FaFlask /> Start Diagnostic Flow
          </Button>
          <Button as={NavLink} to={interviewPrepPath} variant="secondary" aria-current={isInterviewPrepOpen ? "page" : undefined}>
            <FaBullseye /> {isInterviewPrepOpen ? "Interview Prep Open" : "Jump to Interview Prep"}
          </Button>
        </div>
      </section>

      <Outlet context={contextValue} />
    </div>
  );
}
