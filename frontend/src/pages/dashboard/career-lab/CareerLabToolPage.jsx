import { useMemo, useState } from "react";
import { NavLink, useOutletContext, useParams } from "react-router-dom";
import { FaArrowRight, FaCheckCircle, FaPlay, FaSpinner, FaSyncAlt } from "react-icons/fa";

import Button from "../../../components/ui/Button";
import { TOOL_MAP } from "./careerLabTools";

function prettyResult(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export default function CareerLabToolPage() {
  const { toolId } = useParams();
  const { inputs, setInputs, results, running, runTool } = useOutletContext();

  const tool = TOOL_MAP[toolId];
  const [draftInputsByTool, setDraftInputsByTool] = useState({});

  const toolInputs = useMemo(() => {
    if (!tool) return {};
    const drafts = draftInputsByTool[tool.id] || {};
    return tool.fields.reduce((acc, field) => {
      acc[field.key] = drafts[field.key] ?? inputs[field.key] ?? "";
      return acc;
    }, {});
  }, [tool, draftInputsByTool, inputs]);

  const mergedInputs = useMemo(() => ({ ...inputs, ...toolInputs }), [inputs, toolInputs]);
  const validationState = useMemo(() => {
    if (!tool) return "invalid";
    return tool.disabled(mergedInputs) ? "blocked" : "ready";
  }, [tool, mergedInputs]);

  if (!tool) {
    return (
      <section className="content-card career-lab-tool-card">
        <h3>Tool Not Found</h3>
        <p className="career-lab-tool-description">Select a valid Career Lab tool from the navigation list.</p>
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
      await runTool(tool, mergedInputs);
    } catch {
      // Error handled elsewhere
    }
  };

  const restoreSharedDefaults = () => {
    setDraftInputsByTool((prev) => ({ ...prev, [tool.id]: {} }));
  };

  const saveToSharedDefaults = () => {
    setInputs((prev) => ({ ...prev, ...toolInputs }));
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
          {validationState === "ready" ? "Ready to run" : "Missing required inputs"}
        </span>
      </div>

      <div className="career-lab-tool-input-grid">
        {tool.fields.map((field) => (
          <div key={field.key} className="career-lab-panel">
            <label htmlFor={`tool-${tool.id}-${field.key}`}>{field.label}</label>
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
        <Button type="button" onClick={handleRun} disabled={isRunning || tool.disabled(mergedInputs)}>
          {isRunning ? <FaSpinner className="spin" /> : <FaPlay />} {isRunning ? tool.runningLabel : tool.buttonLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={restoreSharedDefaults}>
          <FaSyncAlt /> Use shared defaults
        </Button>
        <Button type="button" variant="secondary" onClick={saveToSharedDefaults}>
          Save to shared defaults
        </Button>
        <Button as={NavLink} to="/dashboard/career-lab" variant="secondary">
          Explore all tools <FaArrowRight />
        </Button>
      </div>

      <div className="career-lab-result-panel">
        <div className="career-lab-group-header">
          <h4>Result Output</h4>
          {hasResult ? <span><FaCheckCircle /> Generated</span> : <span>Waiting for run</span>}
        </div>
        <pre>{prettyResult(results[tool.id] || { message: tool.emptyMessage })}</pre>
      </div>
    </section>
  );
}
