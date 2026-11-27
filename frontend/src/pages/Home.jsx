import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./Home.css";

const featureItems = [
  {
    id: "resume-optimization",
    title: "Resume Optimization",
    description:
      "Resume drafting, estimated ATS scoring, and AI-assisted rewriting on paid plans.",
    tag: "Core",
    outcome: "See how your resume lines up before applying",
  },
  {
    id: "cover-letter",
    title: "Cover Letter Generator",
    description:
      "Draft a cover letter for a specific company and position with AI.",
    tag: "Writing",
    outcome: "Start from a draft instead of a blank page",
  },
  {
    id: "job-parser",
    title: "Job Description Parser",
    description:
      "Extract required and preferred skills, responsibilities, and seniority.",
    tag: "Matching",
    outcome: "Focus on what the job description asks for",
  },
  {
    id: "portfolio-audit",
    title: "Portfolio Audit",
    description: "Identify proof gaps in your resume and plan portfolio pieces.",
    tag: "Portfolio",
    outcome: "Tell a stronger technical story",
  },
  {
    id: "interview-prep",
    title: "Interview Prep",
    description:
      "Suggested questions, STAR coaching priorities, and drill plans.",
    tag: "Interview",
    outcome: "Know what to practice next",
  },
  {
    id: "career-strategy",
    title: "Career Strategy Tools",
    description:
      "Role-fit scoring, plus general salary and market estimates.",
    tag: "Strategy",
    outcome: "Compare roles and plan your search",
  },
  {
    id: "competitive-analysis",
    title: "Competitive Analysis",
    description: "Compare your resume with a benchmark resume you provide.",
    tag: "Benchmark",
    outcome: "See which skills overlap and which are missing",
  },
  {
    id: "ats-simulation",
    title: "ATS & Recruiter Simulation",
    description:
      "Keyword matching, estimated ATS scoring, and recruiter red-flag checks.",
    tag: "Simulation",
    outcome: "Catch weak spots before applying",
  },
];

const useCases = [
  {
    title: "Students applying for internships",
    description:
      "Present class projects clearly, and target roles with clearer requirements.",
  },
  {
    title: "Early-career developers",
    description:
      "Find keyword gaps, spot weak bullets, and prepare for recruiter and hiring-manager screens.",
  },
  {
    title: "Career-switching engineers",
    description:
      "Frame previous experience for a new role and plan the transition.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    audience: "Great for first-time users",
    features: [
      "1 AI resume per month",
      "1 AI cover letter per month",
      "Modern template",
      "Job description parser",
      "ATS analysis",
    ],
  },
  {
    name: "Premium",
    price: "$9.99/mo",
    audience: "Students & early-career devs",
    featured: true,
    features: [
      "No monthly resume or cover letter limit*",
      "All 3 templates and PDF download",
      "AI rewriting in the document editor",
      "13 more Career Lab tools, including interview prep",
    ],
  },
  {
    name: "Pro",
    price: "$19.99/mo",
    audience: "Serious job hunters",
    features: [
      "Everything in Premium",
      "Recruiter scan",
      "Salary and market demand estimates",
      "Competitive analysis",
    ],
  },
];

export default function Home() {
  const [navOpen, setNavOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const headerRef = useRef(null);
  const navToggleRef = useRef(null);
  const featuresButtonRef = useRef(null);

  useEffect(() => {
    if (!navOpen && !featuresOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      if (featuresOpen) {
        setFeaturesOpen(false);
        featuresButtonRef.current?.focus();
      } else {
        setNavOpen(false);
        navToggleRef.current?.focus();
      }
    }

    function handlePointerDown(event) {
      if (!headerRef.current?.contains(event.target)) {
        setFeaturesOpen(false);
        setNavOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [navOpen, featuresOpen]);

  function closeMenus() {
    setFeaturesOpen(false);
    setNavOpen(false);
  }

  function handleFeaturesBlur(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFeaturesOpen(false);
    }
  }

  return (
    <div className="home-page">
      <div className="hero-glow hero-glow-one" />
      <div className="hero-glow hero-glow-two" />

      <header className="top-nav" ref={headerRef}>
        <a href="#home" className="brand">
          ResumeCraft AI
        </a>
        <button
          type="button"
          className="nav-menu-toggle"
          ref={navToggleRef}
          aria-expanded={navOpen}
          aria-controls="home-nav-panel"
          onClick={() => setNavOpen((open) => !open)}
        >
          Menu
        </button>
        <div
          id="home-nav-panel"
          className={`top-nav-panel ${navOpen ? "is-open" : ""}`}
        >
          <nav className="main-nav" aria-label="Main navigation">
            <a href="#home" onClick={closeMenus}>Home</a>
            <div className="nav-dropdown" onBlur={handleFeaturesBlur}>
              <button
                type="button"
                ref={featuresButtonRef}
                aria-expanded={featuresOpen}
                aria-controls="home-features-menu"
                onClick={() => setFeaturesOpen((open) => !open)}
              >
                Features
              </button>
              <div
                id="home-features-menu"
                className={`nav-dropdown-menu ${featuresOpen ? "is-open" : ""}`}
              >
                {featureItems.map((item) => (
                  <a key={item.id} href={`#${item.id}`} onClick={closeMenus}>
                    {item.title}
                  </a>
                ))}
              </div>
            </div>
            <a href="#pricing" onClick={closeMenus}>Pricing</a>
            <a href="#how-it-works" onClick={closeMenus}>How It Works</a>
            <a href="#about" onClick={closeMenus}>About</a>
            <a href="#contact" onClick={closeMenus}>Contact</a>
            <a href="#faq" onClick={closeMenus}>FAQ</a>
          </nav>
          <div className="top-nav-ctas">
            <Link to="/auth/login" className="btn btn-outline">
              Log In
            </Link>
            <Link to="/auth/signup" className="btn btn-dark">
              Sign Up Free
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section id="home" className="hero-section fade-in-up">
          <div className="hero-copy">
            <p className="kicker">
              AI Career Copilot for Tech Students & Developers
            </p>
            <h1>Plan Your Tech Job Search with AI</h1>
            <p>
              Draft resumes and cover letters, break down job descriptions, run
              estimated ATS and recruiter scans, and plan your job search in one
              place.
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
            <h3>Example Analysis (Sample Data)</h3>
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
          aria-label="Product overview"
        >
          <h2>Overview</h2>
          <p>
            ResumeCraft combines resume and cover letter drafting, ATS-style
            checks, interview prep, and job-search planning for developers and
            tech students.
          </p>
        </section>

        <section id="features" className="section fade-in-up">
          <h2>Features</h2>
          <p className="section-lead">
            Tools for each step from first draft to interview. Scores and
            estimates are guidance, not real ATS or market data.
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

        <section id="use-cases" className="section fade-in-up">
          <h2>Who it can help</h2>
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
          <p className="section-lead">
            * AI features also share a daily usage limit across all users.
          </p>
        </section>

        <section id="how-it-works" className="section fade-in-up">
          <h2>How It Works</h2>
          <ol className="steps-list card">
            <li>Sign up for a free account.</li>
            <li>Enter your details to draft a resume or cover letter.</li>
            <li>Paste your resume and a job description into Career Lab tools.</li>
            <li>Use the results to improve your documents and plan next steps.</li>
          </ol>
        </section>

        <section id="about" className="section fade-in-up">
          <h2>About</h2>
          <p>
            Built by a tech student, ResumeCraft aims to make the job search
            less random and more strategic for developers.
          </p>
        </section>

        <section id="contact" className="section fade-in-up">
          <h2>Contact</h2>
          <p>
            Found a problem, or want to share feedback or request a feature? Use
            the GitHub repository.
          </p>
          <div className="contact-links card">
            <a
              href="https://github.com/mo-sajaad/ResumeCraft"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </section>

        <section id="faq" className="section fade-in-up">
          <h2>FAQ</h2>
          <details className="card">
            <summary>Is there a free plan?</summary>
            <p>
              Yes. It includes one AI resume and one AI cover letter per month,
              the job description parser, and ATS analysis.
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
            <summary>How do I manage a paid plan?</summary>
            <p>
              Use Manage Billing on the payment page to open the Stripe billing
              portal.
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
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
          <a href="#faq">FAQ</a>
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
