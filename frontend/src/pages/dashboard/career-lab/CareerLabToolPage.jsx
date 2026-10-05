import { useMemo, useState } from "react";
import { NavLink, useOutletContext, useParams } from "react-router-dom";
import { FaArrowRight, FaCheckCircle, FaPlay, FaSpinner } from "react-icons/fa";

import Button from "../../../components/ui/Button";
import { useAuth } from "../../../context/useAuth";
import { hasPlanAccess, TOOL_MAP } from "./careerLabTools";

function prettyResult(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export default function CareerLabToolPage() {
  const { toolId } = useParams();
  const { results, running, runTool } = useOutletContext();
  const { profile } = useAuth();

  const tool = TOOL_MAP[toolId];
  const activePlanCode = (profile?.plan_code || "free").toLowerCase();
  const hasAccess = tool
    ? hasPlanAccess(activePlanCode, tool.minimumPlan)
    : false;
  const minimumPlanLabel = tool?.minimumPlan
    ? tool.minimumPlan.charAt(0).toUpperCase() + tool.minimumPlan.slice(1)
    : "Premium";
  const [draftInputsByTool, setDraftInputsByTool] = useState({});

  const toolInputs = useMemo(() => {
    if (!tool) return {};
    const drafts = draftInputsByTool[tool.id] || {};
    return tool.fields.reduce((acc, field) => {
      acc[field.key] = drafts[field.key] ?? "";
      return acc;
    }, {});
  }, [tool, draftInputsByTool]);

  const validationState = useMemo(() => {
    if (!tool) return "invalid";
    return tool.disabled(toolInputs) ? "blocked" : "ready";
  }, [tool, toolInputs]);

  if (!tool) {
    return (
      <section className="content-card career-lab-tool-card">
        <h3>Tool Not Found</h3>
        <p className="career-lab-tool-description">
          Select a valid Career Lab tool from the navigation list.
        </p>
      </section>
    );
  }

  if (!hasAccess) {
    return (
      <section className="content-card career-lab-tool-card">
        <h3>{minimumPlanLabel} Plan Required</h3>
        <p className="career-lab-tool-description">
          {tool.title} is available on the {minimumPlanLabel} plan.
        </p>
        <Button as={NavLink} to="/dashboard/payment">
          View {minimumPlanLabel} plan
        </Button>
      </section>
    );
  }

  const isRunning = Boolean(running[tool.id]);
  const hasResult = Boolean(results[tool.id]);

  const handleInputChange = (key, value) => {
    setDraftInputsByTool((prev) => ({
      ...prev,
      [tool.id]: {
        ...(prev[tool.id] || {}),
        [key]: value,
      },
    }));
  };

  const handleRun = async () => {
    try {
      await runTool(tool, toolInputs);
    } catch {
      // Error handled elsewhere
    }
  };

  return (
    <section className="content-card career-lab-tool-card">
      <div className="career-lab-tool-header">
        <div>
          <p className="career-lab-eyebrow">Tool Workspace</p>
          <h3>{tool.title}</h3>
          <p className="career-lab-tool-description">{tool.description}</p>
        </div>
        <span className={`career-lab-status-pill ${validationState}`}>
          {validationState === "ready"
            ? "Ready to run"
            : "Missing required inputs"}
        </span>
      </div>

      <div className="career-lab-tool-input-grid">
        {tool.fields.map((field) => (
          <div key={field.key} className="career-lab-panel">
            <label htmlFor={`tool-${tool.id}-${field.key}`}>
              {field.label}
            </label>
            {field.type === "textarea" ? (
              <textarea
                id={`tool-${tool.id}-${field.key}`}
                className="workspace-editor"
                value={toolInputs[field.key] || ""}
                onChange={(e) => handleInputChange(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            ) : (
              <input
                id={`tool-${tool.id}-${field.key}`}
                className="career-lab-input"
                value={toolInputs[field.key] || ""}
                onChange={(e) => handleInputChange(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}
          </div>
        ))}
      </div>

      <div className="career-lab-tool-actions">
        <Button
          type="button"
          onClick={handleRun}
          disabled={isRunning || tool.disabled(toolInputs)}
          className="career-lab-action-btn"
        >
          {isRunning ? <FaSpinner className="spin" /> : <FaPlay />}
          <span className="career-lab-action-label">
            {isRunning ? tool.runningLabel : tool.buttonLabel}
          </span>
        </Button>
        <Button
          as={NavLink}
          to="/dashboard/career-lab"
          variant="secondary"
          className="career-lab-action-btn"
        >
          <FaArrowRight />
          <span className="career-lab-action-label">Explore all tools</span>
        </Button>
      </div>

      <div className="career-lab-result-panel">
        <div className="career-lab-group-header">
          <h4>Result Output</h4>
          {hasResult ? (
            <span className="career-lab-result-state generated">
              <FaCheckCircle /> Generated
            </span>
          ) : (
            <span className="career-lab-result-state waiting">
              Waiting for run
            </span>
          )}
        </div>
        <pre>
          {prettyResult(results[tool.id] || { message: tool.emptyMessage })}
        </pre>
      </div>
    </section>
  );
}
