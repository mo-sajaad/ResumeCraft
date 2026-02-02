import "./dashboard/DashboardPages.css";

export default function Settings() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your profile, preferences, and security settings.</p>
        </div>
      </div>

      <div className="form-stack">
        <div className="content-card">
          <h3>Profile</h3>
          <div className="input-grid">
            <div className="input-group">
              <label htmlFor="full-name">Full name</label>
              <input id="full-name" placeholder="John Doe" />
            </div>
            <div className="input-group">
              <label htmlFor="email">Email address</label>
              <input id="email" placeholder="john.doe@email.com" />
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="headline">Professional headline</label>
            <input id="headline" placeholder="Product designer focused on growth" />
          </div>
        </div>

        <div className="content-card">
          <h3>Preferences</h3>
          <div className="form-stack">
            <label className="preference-toggle">
              Weekly insights
              <input type="checkbox" defaultChecked />
            </label>
            <label className="preference-toggle">
              Job alerts
              <input type="checkbox" />
            </label>
          </div>
        </div>

        <div className="content-card">
          <h3>Security</h3>
          <div className="input-grid">
            <div className="input-group">
              <label htmlFor="password">New password</label>
              <input id="password" type="password" placeholder="••••••••" />
            </div>
            <div className="input-group">
              <label htmlFor="confirm-password">Confirm password</label>
              <input id="confirm-password" type="password" placeholder="••••••••" />
            </div>
          </div>
        </div>

        <div className="header-actions">
          <button className="btn btn-dark" type="button">
            Save changes
          </button>
          <button className="btn btn-outline" type="button">
            Reset password
          </button>
        </div>
      </div>
    </div>
  );
}
