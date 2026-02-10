import "./dashboard/DashboardPages.css";

export default function Payment() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Upgrade to Premium</h1>
          <p className="page-subtitle">Unlock all features and take your job search to the next level</p>
        </div>
      </div>

      <div className="pricing-grid">
        <div className="pricing-card">
          <div className="pricing-features">
            <h3>Free</h3>
            <p className="pricing-price">$0</p>
            <p className="page-subtitle">Perfect for getting started</p>
            <div className="pricing-list">
              <span>✓ 1 resume</span>
              <span>✓ 1 cover letter</span>
              <span>✓ Basic templates</span>
              <span>✓ PDF download</span>
              <span>✓ Limited AI suggestions</span>
            </div>
          </div>
          <button className="btn btn-outline pricing-button" type="button">
            Current Plan
          </button>
        </div>

        <div className="pricing-card featured">
          <span className="pricing-badge">Most Popular</span>
          <div className="pricing-features">
            <h3>Premium</h3>
            <p className="pricing-price">$9.99</p>
            <p className="page-subtitle">For serious job seekers</p>
            <div className="pricing-list">
              <span>✓ Unlimited resumes & cover letters</span>
              <span>✓ All premium templates</span>
              <span>✓ Unlimited PDF & Word downloads</span>
              <span>✓ Advanced AI suggestions</span>
              <span>✓ ATS optimization score</span>
              <span>✓ Priority support</span>
              <span>✓ Custom branding</span>
              <span>✓ Export to multiple formats</span>
            </div>
          </div>
          <button className="btn btn-dark pricing-button" type="button">
            Choose Premium
          </button>
        </div>

        <div className="pricing-card">
          <div className="pricing-features">
            <h3>Lifetime</h3>
            <p className="pricing-price">$49.99</p>
            <p className="page-subtitle">Best value - pay once, use forever</p>
            <div className="pricing-list">
              <span>✓ Everything in Premium</span>
              <span>✓ Lifetime access</span>
              <span>✓ Future feature updates</span>
              <span>✓ No recurring charges</span>
              <span>✓ VIP support</span>
            </div>
          </div>
          <button className="btn btn-outline pricing-button" type="button">
              Choose Lifetime
          </button>
        </div>
      </div>

      <div className="content-section">
        <div className="content-card text-align">
          <h3>Premium Features</h3>
          <div className="feature-grid">
            <div className="feature-card">
              <div className="promo-icon">✨</div>
              <strong>Advanced AI</strong>
              <p>Get intelligent suggestions for every section of your resume</p>
            </div>
            <div className="feature-card">
              <div className="promo-icon">📄</div>
              <strong>Premium Templates</strong>
              <p>Access to 50+ professional, ATS-optimized templates</p>
            </div>
            <div className="feature-card">
              <div className="promo-icon">⬇</div>
              <strong>Unlimited Downloads</strong>
              <p>Download in PDF, Word, and text formats anytime</p>
            </div>
            <div className="feature-card">
              <div className="promo-icon">⚡</div>
              <strong>ATS Score</strong>
              <p>See how well your resume performs with ATS systems</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
