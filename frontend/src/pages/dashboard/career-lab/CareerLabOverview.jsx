import { NavLink } from "react-router-dom";

export default function CareerLabOverview() {
  return (
    <section className="content-card career-lab-panel">
      <h3>Career Lab Overview</h3>
      <p className="career-lab-tool-description">
        The Career Lab is now fully split into separate pages for most tools. Pick a specific tool from the tool navigation above.
      </p>
      <div>
        <NavLink className="btn btn-dark" to="/dashboard/career-lab/tools/ats-analysis">
          Start with ATS Analysis
        </NavLink>
      </div>
    </section>
  );
}
