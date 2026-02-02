import "./DashboardPages.css";

export default function ResumeNew() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Edit Resume</h1>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline" type="button">
            ✨ AI Suggestions
          </button>
          <button className="btn btn-dark" type="button">
            💾 Save
          </button>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-stack">
          <div className="content-card">
            <h3>Personal Information</h3>
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
              <div className="input-group">
                <label htmlFor="location">Location</label>
                <input id="location" placeholder="San Francisco, CA" />
              </div>
              <div className="input-group">
                <label htmlFor="linkedin">LinkedIn</label>
                <input id="linkedin" placeholder="linkedin.com/in/johndoe" />
              </div>
            </div>
          </div>

          <div className="content-card">
            <h3>Professional Summary</h3>
            <div className="input-group">
              <textarea
                placeholder="Experienced software engineer with a passion for building scalable web applications..."
              />
            </div>
          </div>

          <div className="content-card">
            <div className="section-title">
              <h3>Work Experience</h3>
              <button className="btn btn-outline" type="button">
                ＋ Add
              </button>
            </div>
            <div className="input-grid">
              <div className="input-group">
                <label>Company</label>
                <input placeholder="Tech Corp" />
              </div>
              <div className="input-group">
                <label>Position</label>
                <input placeholder="Senior Software Engineer" />
              </div>
              <div className="input-group">
                <label>Start Date</label>
                <input placeholder="January 2020" />
              </div>
              <div className="input-group">
                <label>End Date</label>
                <input placeholder="Present" />
              </div>
            </div>
            <div className="input-group">
              <label>Description</label>
              <textarea placeholder="List key achievements and responsibilities." />
            </div>
          </div>

          <div className="content-card">
            <h3>Education</h3>
            <div className="input-grid">
              <div className="input-group">
                <label>School</label>
                <input placeholder="University of Technology" />
              </div>
              <div className="input-group">
                <label>Degree</label>
                <input placeholder="Bachelor of Science" />
              </div>
              <div className="input-group">
                <label>Field of Study</label>
                <input placeholder="Computer Science" />
              </div>
              <div className="input-group">
                <label>Graduation Date</label>
                <input placeholder="May 2018" />
              </div>
            </div>
          </div>

          <div className="content-card">
            <h3>Skills</h3>
            <div className="tag-row">
              <span className="tag">JavaScript ✕</span>
              <span className="tag">TypeScript ✕</span>
              <span className="tag">React ✕</span>
              <span className="tag">Node.js ✕</span>
              <span className="tag">Python ✕</span>
              <span className="tag">AWS ✕</span>
              <span className="tag">Docker ✕</span>
              <span className="tag">Git ✕</span>
              <span className="tag add-tag">＋ Add Skill</span>
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
            <strong>John Doe</strong>
            <p>john.doe@email.com · (555) 123-4567 · San Francisco, CA</p>
            <p>Professional summary and experience preview will appear here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
