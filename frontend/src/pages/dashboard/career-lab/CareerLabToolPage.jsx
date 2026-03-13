import { useOutletContext, useParams } from "react-router-dom";

import { TOOL_MAP } from "./careerLabTools";

export default function CareerLabToolPage() {
  const { toolId } = useParams();
  const { inputs, results, running, runTool } = useOutletContext();

  const tool = TOOL_MAP[toolId];

  if (!tool) {
    return (
      <section className="content-card career-lab-panel">
        <h3>Tool Not Found</h3>
        <p className="career-lab-tool-description">Select a valid Career Lab tool from the navigation list.</p>
      </section>
    );
  }

  return (
    <section className="content-card career-lab-tool-card">
      <h3>{tool.title}</h3>
      <p className="career-lab-tool-description">{tool.description}</p>
      <button className="btn btn-outline" type="button" onClick={() => runTool(tool)} disabled={running[tool.id] || tool.disabled(inputs)}>
        {running[tool.id] ? tool.runningLabel : tool.buttonLabel}
      </button>
      <pre>{JSON.stringify(results[tool.id] || { message: tool.emptyMessage }, null, 2)}</pre>
    </section>
  );
}
