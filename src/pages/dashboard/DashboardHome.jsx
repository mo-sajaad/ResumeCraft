import "./DashboardPages.css";

export default function DashboardHome() {
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
            <div className="promo-icon">👑</div>
            <div>
              <h3>Unlock Premium Features</h3>
              <p>Get unlimited downloads, advanced templates, and AI-powered suggestions.</p>
            </div>
          </div>
          <button className="btn btn-outline">Upgrade Now</button>
        </div>

        <div className="quick-actions">
          <div className="quick-card">
            <div className="promo-details">
              <div className="icon">📄</div>
              <div>
                <strong>Create New Resume</strong>
                <div className="page-subtitle">Start building your professional resume</div>
              </div>
            </div>
            <span>＋</span>
          </div>
          <div className="quick-card">
            <div className="promo-details">
              <div className="icon">✉️</div>
              <div>
                <strong>Create Cover Letter</strong>
                <div className="page-subtitle">Write a compelling cover letter</div>
              </div>
            </div>
            <span>＋</span>
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
            <div className="doc-icon">📄</div>
            <strong>Software Engineer Resume</strong>
            <p className="doc-meta">Senior Software Engineer with 5+ years of experience...</p>
            <div className="doc-footer">
              <span>Edited 2 hours ago</span>
              <span className="edit-link">Edit →</span>
            </div>
          </div>
          <div className="doc-card">
            <div className="doc-icon">📄</div>
            <strong>Product Manager Resume</strong>
            <p className="doc-meta">Product Manager with proven track record in growth...</p>
            <div className="doc-footer">
              <span>Edited 1 day ago</span>
              <span className="edit-link">Edit →</span>
            </div>
          </div>
          <div className="doc-card">
            <div className="doc-icon">📄</div>
            <strong>Marketing Specialist Resume</strong>
            <p className="doc-meta">Marketing specialist with expertise in digital strategy...</p>
            <div className="doc-footer">
              <span>Edited 1 week ago</span>
              <span className="edit-link">Edit →</span>
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
            <div className="doc-icon">✉️</div>
            <strong>Cover Letter - Tech Corp</strong>
            <p className="doc-meta">
              Dear Hiring Manager, I am writing to express my strong interest...
            </p>
            <div className="doc-footer">
              <span>Edited 3 days ago</span>
              <span className="edit-link">Edit →</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
