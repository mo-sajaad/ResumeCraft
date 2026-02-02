import { FaCrown, FaFileAlt, FaEnvelope, FaEdit, FaPlus } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';  // Import useNavigate from react-router-dom
import './DashboardPages.css';

export default function DashboardHome() {
  const navigate = useNavigate(); // useNavigate hook to navigate to different routes

  // Function to handle the "Create New Resume" button click
  const handleCreateResume = () => {
    navigate('/dashboard/resume/new'); // Navigate to the "Create New Resume" page
  };

  // Function to handle the "Create Cover Letter" button click
  const handleCreateCoverLetter = () => {
    navigate('/dashboard/cover-letter/new'); // Navigate to the "Create Cover Letter" page
  };

  // Function to handle the "Upgrade Now" button click
  const handleUpgrade = () => {
    navigate('/dashboard/payment'); // Navigate to the payment or subscription page
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
              <p>Get unlimited downloads, advanced templates, and AI-powered suggestions.</p>
            </div>
          </div>
          {/* Upgrade Now Button */}
          <button className="btn btn-outline" onClick={handleUpgrade}>
            Upgrade Now
          </button>
        </div>

        <div className="quick-actions">
          <div className="quick-card create-button">
            <div className="promo-details">
              <div className="icon">
                <FaFileAlt size={30} />
              </div>
              <div>
                <strong>Create New Resume</strong>
                <div className="page-subtitle">Start building your professional resume</div>
              </div>
            </div>
            {/* Create New Resume Button */}
            <span onClick={handleCreateResume}>
              <FaPlus size={24} />
            </span>
          </div>
          <div className="quick-card create-button">
            <div className="promo-details">
              <div className="icon">
                <FaEnvelope size={30} />
              </div>
              <div>
                <strong>Create Cover Letter</strong>
                <div className="page-subtitle">Write a compelling cover letter</div>
              </div>
            </div>
            {/* Create Cover Letter Button */}
            <span onClick={handleCreateCoverLetter}>
              <FaPlus size={24} />
            </span>
          </div>
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
            <p className="doc-meta">Senior Software Engineer with 5+ years of experience...</p>
            <div className="doc-footer">
              <span>Edited 2 hours ago</span>
              <span className="edit-link"><FaEdit /> Edit →</span>
            </div>
          </div>
          <div className="doc-card">
            <div className="doc-icon">
              <FaFileAlt size={30} />
            </div>
            <strong>Product Manager Resume</strong>
            <p className="doc-meta">Product Manager with proven track record in growth...</p>
            <div className="doc-footer">
              <span>Edited 1 day ago</span>
              <span className="edit-link"><FaEdit /> Edit →</span>
            </div>
          </div>
          <div className="doc-card">
            <div className="doc-icon">
              <FaFileAlt size={30} />
            </div>
            <strong>Marketing Specialist Resume</strong>
            <p className="doc-meta">Marketing specialist with expertise in digital strategy...</p>
            <div className="doc-footer">
              <span>Edited 1 week ago</span>
              <span className="edit-link"><FaEdit /> Edit →</span>
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
              <span className="edit-link"><FaEdit /> Edit →</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
