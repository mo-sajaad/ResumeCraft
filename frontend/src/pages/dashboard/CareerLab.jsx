import { useState } from "react";

import { getAuthHeaders } from "../../utils/auth";
import "./DashboardShared.css";
import "./CareerLab.css";

export default function CareerLab() {
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [benchmarkText, setBenchmarkText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [targetLocation, setTargetLocation] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [answerText, setAnswerText] = useState("");

  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanningRecruiter, setScanningRecruiter] = useState(false);
  const [runningCompetitive, setRunningCompetitive] = useState(false);
  const [runningInterviewPrep, setRunningInterviewPrep] = useState(false);
  const [runningRoleFit, setRunningRoleFit] = useState(false);
  const [runningSalaryEstimate, setRunningSalaryEstimate] = useState(false);
  const [runningMarketDemand, setRunningMarketDemand] = useState(false);
  const [runningRoadmap, setRunningRoadmap] = useState(false);
  const [runningVisaGuidance, setRunningVisaGuidance] = useState(false);
  const [runningReadiness, setRunningReadiness] = useState(false);
  const [runningNetworking, setRunningNetworking] = useState(false);
  const [runningPortfolioAudit, setRunningPortfolioAudit] = useState(false);
  const [runningNegotiationPrep, setRunningNegotiationPrep] = useState(false);
  const [runningJobSprint, setRunningJobSprint] = useState(false);
  const [runningBrandAudit, setRunningBrandAudit] = useState(false);

  const [error, setError] = useState("");
  const [parserResult, setParserResult] = useState(null);
  const [atsResult, setAtsResult] = useState(null);
  const [recruiterResult, setRecruiterResult] = useState(null);
  const [competitiveResult, setCompetitiveResult] = useState(null);
  const [interviewResult, setInterviewResult] = useState(null);
  const [roleFitResult, setRoleFitResult] = useState(null);
  const [salaryResult, setSalaryResult] = useState(null);
  const [marketDemandResult, setMarketDemandResult] = useState(null);
  const [roadmapResult, setRoadmapResult] = useState(null);
  const [visaGuidanceResult, setVisaGuidanceResult] = useState(null);
  const [readinessResult, setReadinessResult] = useState(null);
  const [networkingResult, setNetworkingResult] = useState(null);
  const [portfolioAuditResult, setPortfolioAuditResult] = useState(null);
  const [negotiationResult, setNegotiationResult] = useState(null);
  const [jobSprintResult, setJobSprintResult] = useState(null);
  const [brandAuditResult, setBrandAuditResult] = useState(null);

  const callTool = async (url, payload, setResult, fallbackError) => {
    const response = await fetch(url, {
      method: "POST",
      headers: await getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || fallbackError);
    }

    setResult(data);
  };

  const handleParse = async () => {
    setParsing(true);
    setError("");

    try {
      await callTool("/api/career-tools/job-parser", { jobDescription }, setParserResult, "Failed to parse job description.");
    } catch (err) {
      setError(err.message || "Unable to parse job description.");
    } finally {
      setParsing(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/ats-analysis",
        { resumeText, jobDescription },
        setAtsResult,
        "Failed to run ATS analysis."
      );
    } catch (err) {
      setError(err.message || "Unable to analyze ATS fit.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRecruiterScan = async () => {
    setScanningRecruiter(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/recruiter-scan",
        { resumeText },
        setRecruiterResult,
        "Failed to run recruiter scan."
      );
    } catch (err) {
      setError(err.message || "Unable to run recruiter scan.");
    } finally {
      setScanningRecruiter(false);
    }
  };

  const handleCompetitiveAnalysis = async () => {
    setRunningCompetitive(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/competitive-analysis",
        { resumeText, benchmarkText },
        setCompetitiveResult,
        "Failed to run competitive analysis."
      );
    } catch (err) {
      setError(err.message || "Unable to run competitive analysis.");
    } finally {
      setRunningCompetitive(false);
    }
  };

  const handleInterviewPrep = async () => {
    setRunningInterviewPrep(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/interview-prep",
        { resumeText, jobDescription, answerText },
        setInterviewResult,
        "Failed to run interview prep."
      );
    } catch (err) {
      setError(err.message || "Unable to run interview prep.");
    } finally {
      setRunningInterviewPrep(false);
    }
  };


  const handleSalaryEstimate = async () => {
    setRunningSalaryEstimate(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/salary-estimate",
        { targetRole, location: targetLocation, yearsExperience: Number(yearsExperience || 0) },
        setSalaryResult,
        "Failed to run salary estimate."
      );
    } catch (err) {
      setError(err.message || "Unable to run salary estimate.");
    } finally {
      setRunningSalaryEstimate(false);
    }
  };


  const handleMarketDemand = async () => {
    setRunningMarketDemand(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/market-demand",
        { targetRole, location: targetLocation },
        setMarketDemandResult,
        "Failed to run market demand analysis."
      );
    } catch (err) {
      setError(err.message || "Unable to run market demand analysis.");
    } finally {
      setRunningMarketDemand(false);
    }
  };

  const handleLearningRoadmap = async () => {
    setRunningRoadmap(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/learning-roadmap",
        { resumeText, jobDescription },
        setRoadmapResult,
        "Failed to generate learning roadmap."
      );
    } catch (err) {
      setError(err.message || "Unable to generate learning roadmap.");
    } finally {
      setRunningRoadmap(false);
    }
  };

  const handleVisaGuidance = async () => {
    setRunningVisaGuidance(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/visa-guidance",
        { targetRole, location: targetLocation, resumeText },
        setVisaGuidanceResult,
        "Failed to run visa guidance."
      );
    } catch (err) {
      setError(err.message || "Unable to run visa guidance.");
    } finally {
      setRunningVisaGuidance(false);
    }
  };

  const handleApplicationReadiness = async () => {
    setRunningReadiness(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/application-readiness",
        { resumeText, jobDescription, targetRole },
        setReadinessResult,
        "Failed to run application readiness."
      );
    } catch (err) {
      setError(err.message || "Unable to run application readiness.");
    } finally {
      setRunningReadiness(false);
    }
  };

  const handleNetworkingStrategy = async () => {
    setRunningNetworking(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/networking-strategy",
        { targetRole, location: targetLocation, resumeText },
        setNetworkingResult,
        "Failed to generate networking strategy."
      );
    } catch (err) {
      setError(err.message || "Unable to generate networking strategy.");
    } finally {
      setRunningNetworking(false);
    }
  };

  const handlePortfolioAudit = async () => {
    setRunningPortfolioAudit(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/portfolio-audit",
        { resumeText, targetRole },
        setPortfolioAuditResult,
        "Failed to run portfolio audit."
      );
    } catch (err) {
      setError(err.message || "Unable to run portfolio audit.");
    } finally {
      setRunningPortfolioAudit(false);
    }
  };

  const handleOfferNegotiation = async () => {
    setRunningNegotiationPrep(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/offer-negotiation",
        { targetRole, location: targetLocation, yearsExperience: Number(yearsExperience || 0) },
        setNegotiationResult,
        "Failed to run offer negotiation prep."
      );
    } catch (err) {
      setError(err.message || "Unable to run offer negotiation prep.");
    } finally {
      setRunningNegotiationPrep(false);
    }
  };

  const handleJobSearchSprint = async () => {
    setRunningJobSprint(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/job-search-sprint",
        { targetRole, location: targetLocation, resumeText },
        setJobSprintResult,
        "Failed to generate job search sprint plan."
      );
    } catch (err) {
      setError(err.message || "Unable to generate job search sprint plan.");
    } finally {
      setRunningJobSprint(false);
    }
  };

  const handlePersonalBrandAudit = async () => {
    setRunningBrandAudit(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/personal-brand-audit",
        { resumeText, targetRole },
        setBrandAuditResult,
        "Failed to run personal brand audit."
      );
    } catch (err) {
      setError(err.message || "Unable to run personal brand audit.");
    } finally {
      setRunningBrandAudit(false);
    }
  };

  const handleRoleFit = async () => {
    setRunningRoleFit(true);
    setError("");

    try {
      await callTool(
        "/api/career-tools/role-fit",
        { resumeText, targetRole },
        setRoleFitResult,
        "Failed to run role fit analysis."
      );
    } catch (err) {
      setError(err.message || "Unable to run role fit analysis.");
    } finally {
      setRunningRoleFit(false);
    }
  };

  return (
    <div className="career-lab-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Career Lab</h1>
          <p className="page-subtitle">Includes Job Parser, ATS, Recruiter Scan, Competitive Analysis, Interview Prep, Role Fit, Salary, Market Demand, Roadmap, Visa Guidance, Readiness, Networking, Portfolio Audit, Negotiation, Sprint, and Brand Audit.</p>
        </div>
      </div>

      {error ? <div className="content-card error-message">{error}</div> : null}

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Job Description</h3>
          <textarea
            className="workspace-editor"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste full job description here..."
          />
          <button className="btn btn-outline" type="button" onClick={handleParse} disabled={parsing || !jobDescription.trim()}>
            {parsing ? "Parsing..." : "Parse Job Description"}
          </button>
          <button className="btn btn-dark" type="button" onClick={handleAnalyze} disabled={analyzing || !jobDescription.trim() || !resumeText.trim()}>
            {analyzing ? "Analyzing..." : "Run ATS Analysis"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleInterviewPrep} disabled={runningInterviewPrep || !jobDescription.trim() || !resumeText.trim()}>
            {runningInterviewPrep ? "Preparing..." : "Run Interview Prep"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleLearningRoadmap} disabled={runningRoadmap || !jobDescription.trim() || !resumeText.trim()}>
            {runningRoadmap ? "Generating..." : "Generate Learning Roadmap"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleApplicationReadiness} disabled={runningReadiness || !jobDescription.trim() || !resumeText.trim()}>
            {runningReadiness ? "Scoring..." : "Run Application Readiness"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleJobSearchSprint} disabled={runningJobSprint || !targetRole.trim()}>
            {runningJobSprint ? "Planning..." : "Build Job Search Sprint"}
          </button>
        </section>

        <section className="content-card career-lab-panel">
          <h3>Resume Text</h3>
          <textarea
            className="workspace-editor"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste resume text here for ATS, recruiter, interview, and role-fit analysis..."
          />
          <button className="btn btn-outline" type="button" onClick={handleRecruiterScan} disabled={scanningRecruiter || !resumeText.trim()}>
            {scanningRecruiter ? "Scanning..." : "Run Recruiter Scan"}
          </button>
        </section>
      </div>

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Benchmark Resume (for Competitive Analysis)</h3>
          <textarea
            className="workspace-editor"
            value={benchmarkText}
            onChange={(e) => setBenchmarkText(e.target.value)}
            placeholder="Paste sample FAANG/top-tier benchmark resume text..."
          />
          <button
            className="btn btn-dark"
            type="button"
            onClick={handleCompetitiveAnalysis}
            disabled={runningCompetitive || !resumeText.trim() || !benchmarkText.trim()}
          >
            {runningCompetitive ? "Comparing..." : "Run Competitive Analysis"}
          </button>
        </section>

        <section className="content-card career-lab-panel">
          <h3>Role Fit + Career Strategy</h3>
          <input
            className="career-lab-input"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="Target role (e.g. Senior Backend Engineer)"
          />
          <input
            className="career-lab-input"
            value={targetLocation}
            onChange={(e) => setTargetLocation(e.target.value)}
            placeholder="Location (optional, e.g. London, UK)"
          />
          <input
            className="career-lab-input"
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value)}
            placeholder="Years of experience (optional)"
          />
          <textarea
            className="workspace-editor"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder="Optional: paste one interview answer for grading + confidence scoring"
          />
          <button
            className="btn btn-outline"
            type="button"
            onClick={handleRoleFit}
            disabled={runningRoleFit || !resumeText.trim() || !targetRole.trim()}
          >
            {runningRoleFit ? "Scoring..." : "Run Role Fit Analysis"}
          </button>
          <button
            className="btn btn-dark"
            type="button"
            onClick={handleSalaryEstimate}
            disabled={runningSalaryEstimate || !targetRole.trim()}
          >
            {runningSalaryEstimate ? "Estimating..." : "Estimate Salary"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleMarketDemand} disabled={runningMarketDemand || !targetRole.trim()}>
            {runningMarketDemand ? "Analyzing..." : "Analyze Market Demand"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleVisaGuidance} disabled={runningVisaGuidance || !targetRole.trim() || !targetLocation.trim()}>
            {runningVisaGuidance ? "Guiding..." : "Run Visa Positioning Guidance"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleNetworkingStrategy} disabled={runningNetworking || !targetRole.trim()}>
            {runningNetworking ? "Planning..." : "Build Networking Strategy"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handlePortfolioAudit} disabled={runningPortfolioAudit || !resumeText.trim()}>
            {runningPortfolioAudit ? "Auditing..." : "Run Portfolio Audit"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleOfferNegotiation} disabled={runningNegotiationPrep || !targetRole.trim()}>
            {runningNegotiationPrep ? "Preparing..." : "Prepare Offer Negotiation"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handlePersonalBrandAudit} disabled={runningBrandAudit || !resumeText.trim()}>
            {runningBrandAudit ? "Auditing..." : "Run Personal Brand Audit"}
          </button>
        </section>
      </div>

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Feature Progress</h3>
          <pre>{JSON.stringify({
            jobParser: Boolean(parserResult),
            atsAnalysis: Boolean(atsResult),
            recruiterScan: Boolean(recruiterResult),
            competitiveAnalysis: Boolean(competitiveResult),
            interviewPrep: Boolean(interviewResult),
            roleFit: Boolean(roleFitResult),
            salaryEstimate: Boolean(salaryResult),
            marketDemand: Boolean(marketDemandResult),
            learningRoadmap: Boolean(roadmapResult),
            visaGuidance: Boolean(visaGuidanceResult),
            applicationReadiness: Boolean(readinessResult),
            networkingStrategy: Boolean(networkingResult),
            portfolioAudit: Boolean(portfolioAuditResult),
            offerNegotiation: Boolean(negotiationResult),
            jobSearchSprint: Boolean(jobSprintResult),
            personalBrandAudit: Boolean(brandAuditResult),
          }, null, 2)}</pre>
        </section>
        <section className="content-card career-lab-panel">
          <h3>Interview Prep Output</h3>
          <pre>{JSON.stringify(interviewResult || { message: "No interview prep output yet." }, null, 2)}</pre>
        </section>
      </div>

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Parser Output</h3>
          <pre>{JSON.stringify(parserResult || { message: "No parser output yet." }, null, 2)}</pre>
        </section>
        <section className="content-card career-lab-panel">
          <h3>ATS Output</h3>
          <pre>{JSON.stringify(atsResult || { message: "No ATS output yet." }, null, 2)}</pre>
        </section>
      </div>

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Recruiter Scan Output</h3>
          <pre>{JSON.stringify(recruiterResult || { message: "No recruiter scan output yet." }, null, 2)}</pre>
        </section>
        <section className="content-card career-lab-panel">
          <h3>Competitive Analysis Output</h3>
          <pre>{JSON.stringify(competitiveResult || { message: "No competitive output yet." }, null, 2)}</pre>
        </section>
      </div>

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Role Fit Output</h3>
          <pre>{JSON.stringify(roleFitResult || { message: "No role-fit output yet." }, null, 2)}</pre>
        </section>
        <section className="content-card career-lab-panel">
          <h3>Salary Estimator Output</h3>
          <pre>{JSON.stringify(salaryResult || { message: "No salary estimate yet." }, null, 2)}</pre>
        </section>
      </div>

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Market Demand Output</h3>
          <pre>{JSON.stringify(marketDemandResult || { message: "No market demand analysis yet." }, null, 2)}</pre>
        </section>
        <section className="content-card career-lab-panel">
          <h3>Learning Roadmap Output</h3>
          <pre>{JSON.stringify(roadmapResult || { message: "No learning roadmap yet." }, null, 2)}</pre>
        </section>
      </div>

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Visa Guidance Output</h3>
          <pre>{JSON.stringify(visaGuidanceResult || { message: "No visa guidance yet." }, null, 2)}</pre>
        </section>
        <section className="content-card career-lab-panel">
          <h3>Application Readiness Output</h3>
          <pre>{JSON.stringify(readinessResult || { message: "No application readiness output yet." }, null, 2)}</pre>
        </section>
      </div>

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Networking Strategy Output</h3>
          <pre>{JSON.stringify(networkingResult || { message: "No networking strategy yet." }, null, 2)}</pre>
        </section>
        <section className="content-card career-lab-panel">
          <h3>Portfolio Audit Output</h3>
          <pre>{JSON.stringify(portfolioAuditResult || { message: "No portfolio audit yet." }, null, 2)}</pre>
        </section>
      </div>

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Offer Negotiation Output</h3>
          <pre>{JSON.stringify(negotiationResult || { message: "No negotiation prep yet." }, null, 2)}</pre>
        </section>
        <section className="content-card career-lab-panel">
          <h3>Job Search Sprint Output</h3>
          <pre>{JSON.stringify(jobSprintResult || { message: "No sprint plan yet." }, null, 2)}</pre>
        </section>
      </div>

      <div className="career-lab-layout">
        <section className="content-card career-lab-panel">
          <h3>Personal Brand Audit Output</h3>
          <pre>{JSON.stringify(brandAuditResult || { message: "No brand audit yet." }, null, 2)}</pre>
        </section>
      </div>

    </div>
  );
}
