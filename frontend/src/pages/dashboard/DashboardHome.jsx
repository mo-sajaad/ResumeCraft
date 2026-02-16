import { FaCrown, FaFileAlt, FaEnvelope, FaEdit, FaPlus } from "react-icons/fa";
import { NavLink, useNavigate } from "react-router-dom";

import { ROUTES } from "../../constants/routes";
import "./DashboardPages.css";

export default function DashboardHome() {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    navigate(ROUTES.PAYMENT);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Documents</h1>
          <p className="page-subtitle">Manage your resumes and cover letters</p>
        </div>
      </div>

      <section className="content-section">
        <div className="promo-card">
          <div className="promo-details">
            <div className="promo-icon">
              <FaCrown size={40} />
            </div>
            <div>
              <h3>Unlock Premium Features</h3>
              <p>
                Get unlimited downloads, advanced templates, and AI-powered
                suggestions.
              </p>
            </div>
          </div>
          <button className="btn btn-outline" onClick={handleUpgrade}>
            Upgrade Now
          </button>
        </div>

        <div className="quick-actions">
          {/* Create New Resume */}
          <NavLink
            to={ROUTES.RESUME_NEW}
            className="quick-card create-button"
          >
            <div className="promo-details">
              <div className="icon">
                <FaFileAlt size={30} />
              </div>
              <div>
                <strong>Create New Resume</strong>
                <div className="page-subtitle">
                  Start building your professional resume
                </div>
              </div>
            </div>
            <FaPlus size={24} />
          </NavLink>

          {/* Create Cover Letter */}
          <NavLink
            to={ROUTES.COVERLETTER_NEW}
            className="quick-card create-button"
          >
            <div className="promo-details">
              <div className="icon">
                <FaEnvelope size={30} />
              </div>
              <div>
                <strong>Create Cover Letter</strong>
                <div className="page-subtitle">
                  Write a compelling cover letter
                </div>
              </div>
            </div>
            <FaPlus size={24} />
          </NavLink>
        </div>
      </section>

      <section className="content-section">
        <div className="section-title">
          <h3>My Resumes</h3>
          <span className="section-count">3 resumes</span>
        </div>

        <div className="document-grid">
          <div className="doc-card">
            <div className="doc-icon">
              <FaFileAlt size={30} />
            </div>
            <strong>Software Engineer Resume</strong>
            <p className="doc-meta">
              Senior Software Engineer with 5+ years of experience...
            </p>
            <div className="doc-footer">
              <span>Edited 2 hours ago</span>
              <span className="edit-link">
                <FaEdit /> Edit →
              </span>
            </div>
          </div>

          <div className="doc-card">
            <div className="doc-icon">
              <FaFileAlt size={30} />
            </div>
            <strong>Product Manager Resume</strong>
            <p className="doc-meta">
              Product Manager with proven track record in growth...
            </p>
            <div className="doc-footer">
              <span>Edited 1 day ago</span>
              <span className="edit-link">
                <FaEdit /> Edit →
              </span>
            </div>
          </div>

          <div className="doc-card">
            <div className="doc-icon">
              <FaFileAlt size={30} />
            </div>
            <strong>Marketing Specialist Resume</strong>
            <p className="doc-meta">
              Marketing specialist with expertise in digital strategy...
            </p>
            <div className="doc-footer">
              <span>Edited 1 week ago</span>
              <span className="edit-link">
                <FaEdit /> Edit →
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="section-title">
          <h3>My Cover Letters</h3>
          <span className="section-count">1 cover letter</span>
        </div>

        <div className="document-grid">
          <div className="doc-card">
            <div className="doc-icon">
              <FaEnvelope size={30} />
            </div>
            <strong>Cover Letter - Tech Corp</strong>
            <p className="doc-meta">
              Dear Hiring Manager, I am writing to express my strong interest...
            </p>
            <div className="doc-footer">
              <span>Edited 3 days ago</span>
              <span className="edit-link">
                <FaEdit /> Edit →
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
