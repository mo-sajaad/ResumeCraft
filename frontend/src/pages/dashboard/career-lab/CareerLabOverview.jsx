import { NavLink } from "react-router-dom";
import { FaArrowRight, FaChartLine, FaCheckCircle, FaCompass, FaUserTie } from "react-icons/fa";

import { CAREER_LAB_TOOLS, TOOL_CATEGORIES } from "./careerLabTools";

export default function CareerLabOverview() {
  return (
    <section className="content-card career-lab-overview">
      <div className="career-lab-group-header">
        <h3>Recommended Flow</h3>
        <span>Professional workflow for job-search execution</span>
      </div>

      <div className="career-lab-workflow-grid">
        <article className="career-lab-workflow-card">
          <div className="career-lab-workflow-icon"><FaChartLine /></div>
          <h4>Diagnose</h4>
          <p>Start with ATS Analysis and Role Fit to identify resume and targeting gaps.</p>
        </article>
        <article className="career-lab-workflow-card">
          <div className="career-lab-workflow-icon"><FaCompass /></div>
          <h4>Strategize</h4>
          <p>Use market tools to pick targets, sharpen positioning, and plan outreach.</p>
        </article>
        <article className="career-lab-workflow-card">
          <div className="career-lab-workflow-icon"><FaUserTie /></div>
          <h4>Execute</h4>
          <p>Generate prep plans, messages, and interview drills to convert faster.</p>
        </article>
      </div>

      <div className="career-lab-categories">
        {TOOL_CATEGORIES.map((category) => {
          const tools = CAREER_LAB_TOOLS.filter((tool) => tool.category === category.id);
          return (
            <article key={category.id} className="career-lab-category-card">
              <h4>{category.label}</h4>
              <ul>
                {tools.map((tool) => (
                  <li key={tool.id}><FaCheckCircle /> {tool.title}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <div className="career-lab-cta-row">
        <NavLink className="ui-btn ui-btn-primary" to="/dashboard/career-lab/tools/ats-analysis">
          Start with ATS Analysis <FaArrowRight />
        </NavLink>
      </div>
    </section>
  );
}
