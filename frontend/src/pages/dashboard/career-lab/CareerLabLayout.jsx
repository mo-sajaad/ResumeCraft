import { NavLink, Outlet } from "react-router-dom";
import { useMemo, useState } from "react";

import { getAuthHeaders } from "../../../utils/auth";
import { CAREER_LAB_TOOLS, TOOL_CATEGORIES } from "./careerLabTools";
import "../CareerLab.css";

export default function CareerLabLayout() {
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

  const progress = useMemo(() => {
    const total = CAREER_LAB_TOOLS.length;
    const completed = CAREER_LAB_TOOLS.filter((tool) => Boolean(results[tool.id])).length;
    return { completed, total };
  }, [results]);

  const runTool = async (tool) => {
    setRunning((prev) => ({ ...prev, [tool.id]: true }));
    setError("");
    try {
      const response = await fetch(tool.endpoint, {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(tool.payload(inputs)),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Career Lab</h1>
          <p className="page-subtitle">Separated pages for individual tools with shared input workspace.</p>
        </div>
      </div>

      {error ? <div className="content-card error-message">{error}</div> : null}

      <section className="content-card career-lab-inputs">
        <h3>Shared Inputs</h3>
        <div className="career-lab-layout">
          <section className="career-lab-panel">
            <h4>Job Description</h4>
            <textarea className="workspace-editor" value={inputs.jobDescription} onChange={(e) => setInputs((p) => ({ ...p, jobDescription: e.target.value }))} placeholder="Paste full job description here..." />
          </section>
          <section className="career-lab-panel">
            <h4>Resume Text</h4>
            <textarea className="workspace-editor" value={inputs.resumeText} onChange={(e) => setInputs((p) => ({ ...p, resumeText: e.target.value }))} placeholder="Paste resume text for analysis tools..." />
          </section>
        </div>
        <div className="career-lab-layout">
          <section className="career-lab-panel">
            <h4>Benchmark Resume</h4>
            <textarea className="workspace-editor" value={inputs.benchmarkText} onChange={(e) => setInputs((p) => ({ ...p, benchmarkText: e.target.value }))} placeholder="Paste benchmark resume for competitive analysis..." />
          </section>
          <section className="career-lab-panel">
            <h4>Role, Location, Experience, Interview Answer</h4>
            <input className="career-lab-input" value={inputs.targetRole} onChange={(e) => setInputs((p) => ({ ...p, targetRole: e.target.value }))} placeholder="Target role" />
            <input className="career-lab-input" value={inputs.targetLocation} onChange={(e) => setInputs((p) => ({ ...p, targetLocation: e.target.value }))} placeholder="Target location" />
            <input className="career-lab-input" value={inputs.yearsExperience} onChange={(e) => setInputs((p) => ({ ...p, yearsExperience: e.target.value }))} placeholder="Years of experience" />
            <textarea className="workspace-editor" value={inputs.answerText} onChange={(e) => setInputs((p) => ({ ...p, answerText: e.target.value }))} placeholder="Optional interview answer text..." />
          </section>
        </div>
      </section>

      <section className="content-card career-lab-tool-nav-wrapper">
        <div className="career-lab-group-header">
          <h2>Tool Pages</h2>
          <span>{progress.completed}/{progress.total} completed</span>
        </div>
        <div className="career-lab-tool-nav-grid">
          {TOOL_CATEGORIES.map((category) => (
            <div key={category.id} className="career-lab-tool-nav-col">
              <h4>{category.label}</h4>
              <div className="career-lab-tool-nav-list">
                {CAREER_LAB_TOOLS.filter((tool) => tool.category === category.id).map((tool) => (
                  <NavLink key={tool.id} to={`/dashboard/career-lab/tools/${tool.id}`} className="career-lab-tool-link">
                    {tool.title}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Outlet context={contextValue} />
    </div>
  );
}
