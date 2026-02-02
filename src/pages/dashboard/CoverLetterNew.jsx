import "./DashboardPages.css";

export default function CoverLetterNew() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Edit Cover Letter</h1>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline" type="button">
            ✨ AI Generate
          </button>
          <button className="btn btn-dark" type="button">
            💾 Save
          </button>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-stack">
          <div className="content-card">
            <h3>Your Information</h3>
            <div className="input-group">
              <label htmlFor="full-name">Full Name</label>
              <input id="full-name" placeholder="John Doe" />
            </div>
            <div className="input-grid">
              <div className="input-group">
                <label htmlFor="email">Email</label>
                <input id="email" placeholder="john.doe@email.com" />
              </div>
              <div className="input-group">
                <label htmlFor="phone">Phone</label>
                <input id="phone" placeholder="(555) 123-4567" />
              </div>
            </div>
            <div className="input-group">
              <label htmlFor="address">Address</label>
              <input id="address" placeholder="123 Main St, San Francisco, CA 94102" />
            </div>
          </div>

          <div className="content-card">
            <h3>Job Details</h3>
            <div className="input-group">
              <label htmlFor="company-name">Company Name</label>
              <input id="company-name" placeholder="Tech Corp" />
            </div>
            <div className="input-group">
              <label htmlFor="position">Position</label>
              <input id="position" placeholder="Senior Software Engineer" />
            </div>
            <div className="input-group">
              <label htmlFor="manager">Hiring Manager (Optional)</label>
              <input id="manager" placeholder="Jane Smith" />
            </div>
          </div>

          <div className="content-card">
            <div className="section-title">
              <h3>Letter Content</h3>
              <button className="btn btn-outline" type="button">
                ✨ Generate with AI
              </button>
            </div>
            <div className="input-group">
              <label>Opening Paragraph</label>
              <textarea placeholder="Introduce yourself and state the position you're applying for." />
            </div>
            <div className="input-group">
              <label>Body Paragraphs</label>
              <textarea placeholder="Highlight your qualifications and achievements." />
            </div>
            <div className="input-group">
              <label>Closing Paragraph</label>
              <textarea placeholder="Thank the reader and express enthusiasm for next steps." />
            </div>
          </div>
        </div>

        <div className="content-card preview-card">
          <div className="section-title">
            <h3>Preview</h3>
            <button className="btn btn-outline" type="button">
              ⬇ Download
            </button>
          </div>
          <div className="preview-placeholder">
            <p>John Doe</p>
            <p>123 Main St, San Francisco, CA 94102</p>
            <p>john.doe@email.com · (555) 123-4567</p>
            <p>Dear Jane Smith,</p>
            <p>Cover letter preview will appear here as you type.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
