import { useMemo } from "react";
import { NavLink, useOutletContext, useParams } from "react-router-dom";
import { FaArrowRight, FaCheckCircle, FaPlay, FaSpinner } from "react-icons/fa";

import Button from "../../../components/ui/Button";
import { TOOL_MAP } from "./careerLabTools";

function prettyResult(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export default function CareerLabToolPage() {
  const { toolId } = useParams();
  const { inputs, results, running, runTool } = useOutletContext();

  const tool = TOOL_MAP[toolId];

  const validationState = useMemo(() => {
    if (!tool) return "invalid";
    return tool.disabled(inputs) ? "blocked" : "ready";
  }, [tool, inputs]);

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

      <div className="career-lab-tool-actions">
        <Button type="button" onClick={() => runTool(tool)} disabled={isRunning || tool.disabled(inputs)}>
          {isRunning ? <FaSpinner className="spin" /> : <FaPlay />} {isRunning ? tool.runningLabel : tool.buttonLabel}
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
