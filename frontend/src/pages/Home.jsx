import { Link } from "react-router-dom";
import "./Home.css";

const featureItems = [
  { id: "resume-optimization", title: "Resume Optimization", description: "ATS scoring, bullet rewrites, and role-specific resume improvements." },
  { id: "cover-letter", title: "Cover Letter Generator", description: "Generate job-tailored cover letters instantly from your resume + target JD." },
  { id: "job-parser", title: "Job Description Parser", description: "Extract must-have skills, responsibilities, and match signals." },
  { id: "github-portfolio", title: "GitHub & Portfolio Optimization", description: "Improve README narratives and infer missing stack signals." },
  { id: "interview-prep", title: "Interview Prep", description: "Question banks, STAR response coaching, and mock interview flow." },
  { id: "career-strategy", title: "Career Strategy Tools", description: "Salary estimates, market demand insights, and role-fit analyzers." },
  { id: "competitive-intelligence", title: "Competitive Intelligence", description: "Benchmark your resume against top candidate patterns." },
  { id: "ats-simulation", title: "ATS & Recruiter Simulation", description: "Keyword match, ATS scoring, red flag detection, and recruiter skim view." },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    audience: "Great for first-time users",
    features: ["Limited rewrites", "Basic ATS score", "1 cover letter / week", "Community support"],
  },
  {
    name: "Premium",
    price: "$19/mo",
    audience: "Students & early-career devs",
    featured: true,
    features: ["Unlimited resume rewrites", "Detailed ATS breakdown", "Unlimited cover letters", "Interview prep toolkit"],
  },
  {
    name: "Pro",
    price: "$39/mo",
    audience: "Serious job hunters & FAANG aspirants",
    features: ["Recruiter simulation", "Salary + market trend insights", "Competitive intelligence suite", "Priority support"],
  },
];

export default function Home() {
  return (
    <div className="home-page">
      <header className="top-nav">
        <a href="#home" className="brand">ResumeCraft AI</a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#home">Home</a>
          <div className="nav-dropdown">
            <button type="button">Features</button>
            <div className="nav-dropdown-menu">
              {featureItems.map((item) => (
                <a key={item.id} href={`#${item.id}`}>{item.title}</a>
              ))}
            </div>
          </div>
          <a href="#pricing">Pricing</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#about">About</a>
          <a href="#blog">Blog</a>
          <a href="#contact">Contact</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="top-nav-ctas">
          <Link to="/auth/login" className="btn btn-outline">Log In</Link>
          <Link to="/auth/signup" className="btn btn-dark">Start Free Trial</Link>
        </div>
      </header>

      <main>
        <section id="home" className="hero-section">
          <p className="kicker">AI Career Copilot for Tech Students & Developers</p>
          <h1>Land Tech Jobs Faster with AI</h1>
          <p>
            Optimize your resume, decode job descriptions, simulate ATS + recruiter scans,
            and build a data-backed job search strategy from internship to offer.
          </p>
          <div className="hero-ctas">
            <Link to="/auth/signup" className="btn btn-dark">Try Free</Link>
            <a href="#how-it-works" className="btn btn-outline">See How It Works</a>
          </div>
        </section>

        <section className="section" aria-label="Product overview">
          <h2>Overview</h2>
          <p>
            ResumeCraft combines resume optimization, ATS diagnostics, interview prep, and market intelligence
            into one workflow-focused platform for developers and tech students.
          </p>
        </section>

        <section id="features" className="section">
          <h2>Features</h2>
          <div className="feature-grid">
            {featureItems.map((item) => (
              <article key={item.id} id={item.id} className="card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="section">
          <h2>Pricing</h2>
          <div className="pricing-grid">
            {plans.map((plan) => (
              <article key={plan.name} className={`card price-card ${plan.featured ? "featured" : ""}`}>
                <h3>{plan.name}</h3>
                <p className="price">{plan.price}</p>
                <p>{plan.audience}</p>
                <ul>
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="section">
          <h2>How It Works</h2>
          <ol className="steps-list">
            <li>Sign up and choose your target role.</li>
            <li>Upload or paste your resume + target job description.</li>
            <li>Run ATS, role-fit, and interview prep tools.</li>
            <li>Apply improvements and track outcomes with your dashboard.</li>
          </ol>
          <div className="card demo-box">
            <h3>Interactive Demo Preview</h3>
            <p>Upload a sample resume and instantly preview ATS gap analysis + improved bullets.</p>
            <Link to="/auth/signup" className="btn btn-dark">Launch Demo</Link>
          </div>
          <div className="testimonial-grid">
            <article className="card"><p>“I improved my ATS score from 54 to 82 in one night.”</p><small>- CS Student, UK</small></article>
            <article className="card"><p>“The recruiter simulation caught weak bullets before I applied.”</p><small>- Backend Developer</small></article>
          </div>
        </section>

        <section id="about" className="section">
          <h2>About</h2>
          <p>
            Built by a tech student, ResumeCraft exists to make the job search less random and more strategic for
            developers. Our mission is to help candidates go from resume to offer with clarity and confidence.
          </p>
        </section>

        <section id="blog" className="section">
          <h2>Blog (SEO)</h2>
          <div className="feature-grid">
            <article className="card"><h3>Tech Career Advice</h3><p>ATS tactics, interview prep frameworks, and search strategy playbooks.</p></article>
            <article className="card"><h3>Resume Tips</h3><p>Role-specific optimization guides for FAANG, startups, and product teams.</p></article>
            <article className="card"><h3>Success Stories</h3><p>Real journeys from students and devs who improved outcomes.</p></article>
            <article className="card"><h3>Market Trends</h3><p>Emerging skills, salary movement, and hiring outlook updates.</p></article>
          </div>
        </section>

        <section id="contact" className="section">
          <h2>Contact</h2>
          <p>Need support, want to share feedback, or request a feature? Reach out below.</p>
          <div className="contact-links">
            <a href="mailto:support@resumecraft.ai">support@resumecraft.ai</a>
            <a href="https://linkedin.com" target="_blank" rel="noreferrer">LinkedIn</a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer">Twitter</a>
            <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </section>

        <section id="faq" className="section">
          <h2>FAQ</h2>
          <details><summary>Is there a free plan?</summary><p>Yes. Start free and upgrade once you need unlimited rewrites and advanced analytics.</p></details>
          <details><summary>Who is this built for?</summary><p>Tech students, early-career developers, and professionals targeting stronger roles.</p></details>
          <details><summary>Can I cancel anytime?</summary><p>Yes, you can cancel paid plans at any time from billing settings.</p></details>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <h4>Quick Links</h4>
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
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
