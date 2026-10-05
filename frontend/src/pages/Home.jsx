import { Link } from "react-router-dom";
import "./Home.css";

const featureItems = [
  {
    id: "resume-optimization",
    title: "Resume Optimization",
    description:
      "ATS scoring, bullet rewrites, and role-specific resume improvements.",
    tag: "Core",
    outcome: "Raise match confidence before every application",
  },
  {
    id: "cover-letter",
    title: "Cover Letter Generator",
    description:
      "Generate job-tailored cover letters instantly from your resume + target JD.",
    tag: "Writing",
    outcome: "Ship personalized letters in minutes",
  },
  {
    id: "job-parser",
    title: "Job Description Parser",
    description:
      "Extract must-have skills, responsibilities, and match signals.",
    tag: "Matching",
    outcome: "Prioritize what recruiters actually grade",
  },
  {
    id: "github-portfolio",
    title: "GitHub & Portfolio Optimization",
    description: "Improve README narratives and infer missing stack signals.",
    tag: "Portfolio",
    outcome: "Tell a stronger technical story",
  },
  {
    id: "interview-prep",
    title: "Interview Prep",
    description:
      "Question banks, STAR response coaching, and mock interview flow.",
    tag: "Interview",
    outcome: "Practice with high-signal feedback loops",
  },
  {
    id: "career-strategy",
    title: "Career Strategy Tools",
    description:
      "Salary estimates, market demand insights, and role-fit analyzers.",
    tag: "Strategy",
    outcome: "Choose smarter roles and timelines",
  },
  {
    id: "competitive-intelligence",
    title: "Competitive Intelligence",
    description: "Benchmark your resume against top candidate patterns.",
    tag: "Benchmark",
    outcome: "See where your profile beats or lags",
  },
  {
    id: "ats-simulation",
    title: "ATS & Recruiter Simulation",
    description:
      "Keyword match, ATS scoring, red flag detection, and recruiter skim view.",
    tag: "Simulation",
    outcome: "Preview recruiter reaction before applying",
  },
];

const socialProof = [
  "Google",
  "Meta",
  "Microsoft",
  "Amazon",
  "Stripe",
  "Atlassian",
];

const useCases = [
  {
    title: "Students applying for internships",
    description:
      "Turn class projects into outcomes recruiters understand, and target roles with clearer requirements.",
  },
  {
    title: "Early-career developers",
    description:
      "Find keyword gaps, improve impact bullets, and build confidence for recruiter and hiring-manager screens.",
  },
  {
    title: "Career-switching engineers",
    description:
      "Translate previous experience into role-relevant narratives and focus on highest-probability openings.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    audience: "Great for first-time users",
    features: [
      "Limited rewrites",
      "Basic ATS score",
      "1 cover letter / week",
      "Community support",
    ],
  },
  {
    name: "Premium",
    price: "$9.99/mo",
    audience: "Students & early-career devs",
    featured: true,
    features: [
      "Unlimited resume rewrites",
      "Detailed ATS breakdown",
      "Unlimited cover letters",
      "Interview prep toolkit",
    ],
  },
  {
    name: "Pro",
    price: "$19.99/mo",
    audience: "Serious job hunters & FAANG aspirants",
    features: [
      "Recruiter scan",
      "Salary estimates + market demand",
      "Competitive analysis",
    ],
  },
];

const stats = [
  { value: "82%", label: "Average ATS score lift" },
  { value: "3.1x", label: "More interview callbacks" },
  { value: "12k+", label: "Tech job seekers supported" },
];

const benchmarkRows = [
  {
    area: "Resume builder guidance",
    resumecraft:
      "Role-specific AI guidance with ATS, recruiter skim, and interview tie-in.",
    marketStandard:
      "Strong template + wizard experience, but limited full-loop coaching.",
  },
  {
    area: "Job-match intelligence",
    resumecraft:
      "Live role-fit, ATS diagnostics, and keyword gap analysis from your target JD.",
    marketStandard:
      "Often focused on resume writing quality without deep JD-to-resume matching.",
  },
  {
    area: "Interview & execution",
    resumecraft:
      "Built-in interview prep, outreach planning, and sprint execution tools.",
    marketStandard: "Usually offered as separate products or add-ons.",
  },
  {
    area: "Career strategy depth",
    resumecraft:
      "Salary, market demand, negotiation, pivot planning, and application readiness in one workspace.",
    marketStandard:
      "More document-centric than end-to-end job-search strategy.",
  },
];

const qualitySignals = [
  "ATS-focused language checks and keyword targeting",
  "Actionable rewrites tied to measurable outcomes",
  "One workspace from resume polish to interview prep",
  "AI enhancement fallbacks for reliability in all environments",
];

export default function Home() {
  return (
    <div className="home-page">
      <div className="hero-glow hero-glow-one" />
      <div className="hero-glow hero-glow-two" />

      <header className="top-nav">
        <a href="#home" className="brand">
          ResumeCraft AI
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#home">Home</a>
          <div className="nav-dropdown">
            <button type="button">Features</button>
            <div className="nav-dropdown-menu">
              {featureItems.map((item) => (
                <a key={item.id} href={`#${item.id}`}>
                  {item.title}
                </a>
              ))}
            </div>
          </div>
          <a href="#pricing">Pricing</a>
          <a href="#compare">Compare</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#about">About</a>
          <a href="#blog">Blog</a>
          <a href="#contact">Contact</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="top-nav-ctas">
          <Link to="/auth/login" className="btn btn-outline">
            Log In
          </Link>
          <Link to="/auth/signup" className="btn btn-dark">
            Start Free Trial
          </Link>
        </div>
      </header>

      <main>
        <section id="home" className="hero-section fade-in-up">
          <div className="hero-copy">
            <p className="kicker">
              AI Career Copilot for Tech Students & Developers
            </p>
            <h1>Land Tech Jobs Faster with AI</h1>
            <p>
              Optimize your resume, decode job descriptions, simulate ATS +
              recruiter scans, and build a data-backed job search strategy from
              internship to offer.
            </p>
            <div className="hero-ctas">
              <Link to="/auth/signup" className="btn btn-dark">
                Try Free
              </Link>
              <a href="#how-it-works" className="btn btn-outline">
                See How It Works
              </a>
            </div>
          </div>
          <div className="hero-panel floating">
            <h3>Live Analysis Snapshot</h3>
            <p>
              <strong>Target role:</strong> Backend Engineer (Node.js)
            </p>
            <p>
              <strong>ATS Match:</strong> 84/100
            </p>
            <p>
              <strong>Missing keywords:</strong> system design, kafka,
              observability
            </p>
            <p>
              <strong>Next best action:</strong> Rewrite 3 bullets with impact
              metrics.
            </p>
          </div>
        </section>

        <section
          className="section section-tight fade-in-up"
          aria-label="Social proof"
        >
          <p className="logo-strip-title">
            Trusted by candidates targeting teams at
          </p>
          <div
            className="logo-strip"
            role="list"
            aria-label="Company logos represented as text labels"
          >
            {socialProof.map((logo) => (
              <span key={logo} role="listitem" className="logo-pill">
                {logo}
              </span>
            ))}
          </div>
        </section>

        <section
          className="section section-tight fade-in-up"
          aria-label="Product overview"
        >
          <h2>Overview</h2>
          <p>
            ResumeCraft combines resume optimization, ATS diagnostics, interview
            prep, and market intelligence into one workflow-focused platform for
            developers and tech students.
          </p>
          <div className="stat-strip">
            {stats.map((stat) => (
              <article key={stat.label} className="stat-item card">
                <p className="stat-value">{stat.value}</p>
                <p>{stat.label}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="section fade-in-up">
          <h2>Features</h2>
          <p className="section-lead">
            Everything you need from first draft to final interview, in one
            workflow.
          </p>
          <div className="feature-grid">
            {featureItems.map((item) => (
              <article key={item.id} id={item.id} className="card hover-lift">
                <span className="feature-tag">{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <p className="feature-outcome">{item.outcome}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="compare" className="section fade-in-up">
          <h2>How ResumeCraft compares to traditional resume builders</h2>
          <p className="section-lead">
            We benchmarked our experience against category leaders like
            MyPerfectResume and focused on going beyond document generation into
            full job-search execution.
          </p>
          <div className="comparison-table-wrap card">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Capability Area</th>
                  <th>ResumeCraft</th>
                  <th>Typical Resume Builder</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkRows.map((row) => (
                  <tr key={row.area}>
                    <td>{row.area}</td>
                    <td>{row.resumecraft}</td>
                    <td>{row.marketStandard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="feature-grid">
            {qualitySignals.map((signal) => (
              <article key={signal} className="card hover-lift">
                <h3>Why this matters</h3>
                <p>{signal}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="use-cases" className="section fade-in-up">
          <h2>Built for every stage of the tech job search</h2>
          <div className="testimonial-grid">
            {useCases.map((useCase) => (
              <article key={useCase.title} className="card">
                <h3>{useCase.title}</h3>
                <p>{useCase.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="section fade-in-up">
          <h2>Pricing</h2>
          <div className="pricing-grid">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`card price-card hover-lift ${plan.featured ? "featured" : ""}`}
              >
                {plan.featured && <p className="badge">Most Popular</p>}
                <h3>{plan.name}</h3>
                <p className="price">{plan.price}</p>
                <p>{plan.audience}</p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Link to="/auth/signup" className="btn btn-outline">
                  Choose {plan.name}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="section fade-in-up">
          <h2>How It Works</h2>
          <ol className="steps-list card">
            <li>Sign up and choose your target role.</li>
            <li>Upload or paste your resume + target job description.</li>
            <li>Run ATS, role-fit, and interview prep tools.</li>
            <li>Apply improvements and track outcomes with your dashboard.</li>
          </ol>
          <div className="card demo-box hover-lift">
            <h3>Interactive Demo Preview</h3>
            <p>
              Upload a sample resume and instantly preview ATS gap analysis +
              improved bullets.
            </p>
            <Link to="/auth/signup" className="btn btn-dark">
              Launch Demo
            </Link>
          </div>
          <div className="testimonial-grid">
            <article className="card hover-lift">
              <p>“I improved my ATS score from 54 to 82 in one night.”</p>
              <small>- CS Student, UK</small>
            </article>
            <article className="card hover-lift">
              <p>
                “The recruiter simulation caught weak bullets before I applied.”
              </p>
              <small>- Backend Developer</small>
            </article>
          </div>
        </section>

        <section id="about" className="section fade-in-up">
          <h2>About</h2>
          <p>
            Built by a tech student, ResumeCraft exists to make the job search
            less random and more strategic for developers. Our mission is to
            help candidates go from resume to offer with clarity and confidence.
          </p>
        </section>

        <section id="blog" className="section fade-in-up">
          <h2>Blog (SEO)</h2>
          <div className="feature-grid">
            <article className="card hover-lift">
              <h3>Tech Career Advice</h3>
              <p>
                ATS tactics, interview prep frameworks, and search strategy
                playbooks.
              </p>
            </article>
            <article className="card hover-lift">
              <h3>Resume Tips</h3>
              <p>
                Role-specific optimization guides for FAANG, startups, and
                product teams.
              </p>
            </article>
            <article className="card hover-lift">
              <h3>Success Stories</h3>
              <p>Real journeys from students and devs who improved outcomes.</p>
            </article>
            <article className="card hover-lift">
              <h3>Market Trends</h3>
              <p>
                Emerging skills, salary movement, and hiring outlook updates.
              </p>
            </article>
          </div>
        </section>

        <section id="contact" className="section fade-in-up">
          <h2>Contact</h2>
          <p>
            Need support, want to share feedback, or request a feature? Reach
            out below.
          </p>
          <div className="contact-links card">
            <a href="mailto:support@resumecraft.ai">support@resumecraft.ai</a>
            <a href="https://linkedin.com" target="_blank" rel="noreferrer">
              LinkedIn
            </a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer">
              Twitter
            </a>
            <a href="https://github.com" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </section>

        <section id="faq" className="section fade-in-up">
          <h2>FAQ</h2>
          <details className="card">
            <summary>Should I expect separate pages for every feature?</summary>
            <p>
              Not required for a high-converting SaaS homepage. Keep one focused
              landing page first, then add dedicated feature pages later for
              SEO, ads, and deeper product education.
            </p>
          </details>
          <details className="card">
            <summary>Is there a free plan?</summary>
            <p>
              Yes. Start free and upgrade once you need unlimited rewrites and
              advanced analytics.
            </p>
          </details>
          <details className="card">
            <summary>Who is this built for?</summary>
            <p>
              Tech students, early-career developers, and professionals
              targeting stronger roles.
            </p>
          </details>
          <details className="card">
            <summary>Can I cancel anytime?</summary>
            <p>
              Yes, you can cancel paid plans at any time from billing settings.
            </p>
          </details>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <h4>Quick Links</h4>
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#compare">Compare</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
          <a href="#faq">FAQ</a>
        </div>
        <div>
          <h4>Legal</h4>
          <a href="#">Terms of Service</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Cookie Policy</a>
        </div>
        <div>
          <h4>Account</h4>
          <Link to="/auth/signup">Sign Up</Link>
          <Link to="/auth/login">Log In</Link>
          <Link to="/dashboard">Dashboard</Link>
        </div>
      </footer>
    </div>
  );
}
