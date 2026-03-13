import { useMemo, useState } from "react";

import { getAuthHeaders } from "../../utils/auth";
import "./DashboardShared.css";
import "./CareerLab.css";

function ToolActionCard({
  title,
  description,
  onRun,
  running,
  disabled,
  buttonLabel,
  runningLabel,
  result,
  emptyMessage,
}) {
  return (
    <section className="content-card career-lab-tool-card">
      <h3>{title}</h3>
      <p className="career-lab-tool-description">{description}</p>
      <button className="btn btn-outline" type="button" onClick={onRun} disabled={running || disabled}>
        {running ? runningLabel : buttonLabel}
      </button>
      <pre>{JSON.stringify(result || { message: emptyMessage }, null, 2)}</pre>
    </section>
  );
}

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
  const [runningPivotPlan, setRunningPivotPlan] = useState(false);
  const [runningOutreachMessages, setRunningOutreachMessages] = useState(false);
  const [runningInterviewDrill, setRunningInterviewDrill] = useState(false);

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
  const [pivotPlanResult, setPivotPlanResult] = useState(null);
  const [outreachMessagesResult, setOutreachMessagesResult] = useState(null);
  const [interviewDrillResult, setInterviewDrillResult] = useState(null);

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

  const runTool = async (setRunning, runner, fallbackError) => {
    setRunning(true);
    setError("");
    try {
      await runner();
    } catch (err) {
      setError(err.message || fallbackError);
    } finally {
      setRunning(false);
    }
  };

  const progress = useMemo(() => ({
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
    careerPivotPlan: Boolean(pivotPlanResult),
    outreachMessages: Boolean(outreachMessagesResult),
    interviewDrillPlan: Boolean(interviewDrillResult),
  }), [
    parserResult,
    atsResult,
    recruiterResult,
    competitiveResult,
    interviewResult,
    roleFitResult,
    salaryResult,
    marketDemandResult,
    roadmapResult,
    visaGuidanceResult,
    readinessResult,
    networkingResult,
    portfolioAuditResult,
    negotiationResult,
    jobSprintResult,
    brandAuditResult,
    pivotPlanResult,
    outreachMessagesResult,
    interviewDrillResult,
  ]);

  return (
    <div className="career-lab-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Career Lab</h1>
          <p className="page-subtitle">Tools are now separated by workflow: Core Analysis, Market & Strategy, and Interview & Job Search Execution.</p>
        </div>
      </div>

      {error ? <div className="content-card error-message">{error}</div> : null}

      <section className="content-card career-lab-inputs">
        <h3>Shared Inputs</h3>
        <div className="career-lab-layout">
          <section className="career-lab-panel">
            <h4>Job Description</h4>
            <textarea
              className="workspace-editor"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste full job description here..."
            />
          </section>
          <section className="career-lab-panel">
            <h4>Resume Text</h4>
            <textarea
              className="workspace-editor"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste resume text here for all resume-based tools..."
            />
          </section>
        </div>
        <div className="career-lab-layout">
          <section className="career-lab-panel">
            <h4>Benchmark Resume</h4>
            <textarea
              className="workspace-editor"
              value={benchmarkText}
              onChange={(e) => setBenchmarkText(e.target.value)}
              placeholder="Paste benchmark resume text for competitive analysis..."
            />
          </section>
          <section className="career-lab-panel">
            <h4>Role & Interview Context</h4>
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
              placeholder="Optional interview answer for grading"
            />
          </section>
        </div>
      </section>

      <section className="career-lab-group">
        <div className="career-lab-group-header">
          <h2>Core Analysis Tools</h2>
          <span>{Object.values(progress).filter(Boolean).length}/19 completed</span>
        </div>
        <div className="career-lab-tools-grid">
          <ToolActionCard
            title="Job Parser"
            description="Extract required/preferred skills, seniority, and responsibilities from job descriptions."
            onRun={() => runTool(setParsing, () => callTool("/api/career-tools/job-parser", { jobDescription }, setParserResult, "Failed to parse job description."), "Unable to parse job description.")}
            running={parsing}
            disabled={!jobDescription.trim()}
            buttonLabel="Parse Job Description"
            runningLabel="Parsing..."
            result={parserResult}
            emptyMessage="No parser output yet."
          />
          <ToolActionCard
            title="ATS Analysis"
            description="Score keyword/impact alignment between resume and target job."
            onRun={() => runTool(setAnalyzing, () => callTool("/api/career-tools/ats-analysis", { resumeText, jobDescription }, setAtsResult, "Failed to run ATS analysis."), "Unable to analyze ATS fit.")}
            running={analyzing}
            disabled={!jobDescription.trim() || !resumeText.trim()}
            buttonLabel="Run ATS Analysis"
            runningLabel="Analyzing..."
            result={atsResult}
            emptyMessage="No ATS output yet."
          />
          <ToolActionCard
            title="Recruiter Scan"
            description="Estimate six-second skim readiness and detect red flags."
            onRun={() => runTool(setScanningRecruiter, () => callTool("/api/career-tools/recruiter-scan", { resumeText }, setRecruiterResult, "Failed to run recruiter scan."), "Unable to run recruiter scan.")}
            running={scanningRecruiter}
            disabled={!resumeText.trim()}
            buttonLabel="Run Recruiter Scan"
            runningLabel="Scanning..."
            result={recruiterResult}
            emptyMessage="No recruiter scan output yet."
          />
          <ToolActionCard
            title="Competitive Analysis"
            description="Compare resume skill coverage against a benchmark profile."
            onRun={() => runTool(setRunningCompetitive, () => callTool("/api/career-tools/competitive-analysis", { resumeText, benchmarkText }, setCompetitiveResult, "Failed to run competitive analysis."), "Unable to run competitive analysis.")}
            running={runningCompetitive}
            disabled={!resumeText.trim() || !benchmarkText.trim()}
            buttonLabel="Run Competitive Analysis"
            runningLabel="Comparing..."
            result={competitiveResult}
            emptyMessage="No competitive output yet."
          />
          <ToolActionCard
            title="Role Fit Analysis"
            description="Estimate role fit, remote readiness, and promotion signaling strength."
            onRun={() => runTool(setRunningRoleFit, () => callTool("/api/career-tools/role-fit", { resumeText, targetRole }, setRoleFitResult, "Failed to run role fit analysis."), "Unable to run role fit analysis.")}
            running={runningRoleFit}
            disabled={!resumeText.trim() || !targetRole.trim()}
            buttonLabel="Run Role Fit"
            runningLabel="Scoring..."
            result={roleFitResult}
            emptyMessage="No role-fit output yet."
          />
          <ToolActionCard
            title="Salary Estimate"
            description="Get a compensation range baseline using role/location/experience."
            onRun={() => runTool(setRunningSalaryEstimate, () => callTool("/api/career-tools/salary-estimate", { targetRole, location: targetLocation, yearsExperience: Number(yearsExperience || 0) }, setSalaryResult, "Failed to run salary estimate."), "Unable to run salary estimate.")}
            running={runningSalaryEstimate}
            disabled={!targetRole.trim()}
            buttonLabel="Estimate Salary"
            runningLabel="Estimating..."
            result={salaryResult}
            emptyMessage="No salary estimate yet."
          />
        </div>
      </section>

      <section className="career-lab-group">
        <div className="career-lab-group-header">
          <h2>Market & Strategy Tools</h2>
        </div>
        <div className="career-lab-tools-grid">
          <ToolActionCard
            title="Market Demand"
            description="Evaluate demand strength and market signals for your target role."
            onRun={() => runTool(setRunningMarketDemand, () => callTool("/api/career-tools/market-demand", { targetRole, location: targetLocation }, setMarketDemandResult, "Failed to run market demand analysis."), "Unable to run market demand analysis.")}
            running={runningMarketDemand}
            disabled={!targetRole.trim()}
            buttonLabel="Analyze Market Demand"
            runningLabel="Analyzing..."
            result={marketDemandResult}
            emptyMessage="No market demand analysis yet."
          />
          <ToolActionCard
            title="Learning Roadmap"
            description="Generate a practical roadmap from current profile to target role requirements."
            onRun={() => runTool(setRunningRoadmap, () => callTool("/api/career-tools/learning-roadmap", { resumeText, jobDescription }, setRoadmapResult, "Failed to generate learning roadmap."), "Unable to generate learning roadmap.")}
            running={runningRoadmap}
            disabled={!resumeText.trim() || !jobDescription.trim()}
            buttonLabel="Generate Learning Roadmap"
            runningLabel="Generating..."
            result={roadmapResult}
            emptyMessage="No learning roadmap yet."
          />
          <ToolActionCard
            title="Application Readiness"
            description="Score readiness and get a 14-day action plan for focused applications."
            onRun={() => runTool(setRunningReadiness, () => callTool("/api/career-tools/application-readiness", { resumeText, jobDescription, targetRole }, setReadinessResult, "Failed to run application readiness."), "Unable to run application readiness.")}
            running={runningReadiness}
            disabled={!resumeText.trim() || !jobDescription.trim()}
            buttonLabel="Run Application Readiness"
            runningLabel="Scoring..."
            result={readinessResult}
            emptyMessage="No application readiness output yet."
          />
          <ToolActionCard
            title="Networking Strategy"
            description="Create target channels and outreach cadence for networking."
            onRun={() => runTool(setRunningNetworking, () => callTool("/api/career-tools/networking-strategy", { targetRole, location: targetLocation, resumeText }, setNetworkingResult, "Failed to generate networking strategy."), "Unable to generate networking strategy.")}
            running={runningNetworking}
            disabled={!targetRole.trim()}
            buttonLabel="Build Networking Strategy"
            runningLabel="Planning..."
            result={networkingResult}
            emptyMessage="No networking strategy yet."
          />
          <ToolActionCard
            title="Portfolio Audit"
            description="Identify missing proof artifacts and next portfolio priorities."
            onRun={() => runTool(setRunningPortfolioAudit, () => callTool("/api/career-tools/portfolio-audit", { resumeText, targetRole }, setPortfolioAuditResult, "Failed to run portfolio audit."), "Unable to run portfolio audit.")}
            running={runningPortfolioAudit}
            disabled={!resumeText.trim()}
            buttonLabel="Run Portfolio Audit"
            runningLabel="Auditing..."
            result={portfolioAuditResult}
            emptyMessage="No portfolio audit yet."
          />
          <ToolActionCard
            title="Career Pivot Plan"
            description="Build a structured transition plan for pivoting into a target role."
            onRun={() => runTool(setRunningPivotPlan, () => callTool("/api/career-tools/career-pivot-plan", { resumeText, targetRole, jobDescription }, setPivotPlanResult, "Failed to generate career pivot plan."), "Unable to generate career pivot plan.")}
            running={runningPivotPlan}
            disabled={!resumeText.trim() || !targetRole.trim()}
            buttonLabel="Generate Career Pivot Plan"
            runningLabel="Planning..."
            result={pivotPlanResult}
            emptyMessage="No career pivot plan yet."
          />
          <ToolActionCard
            title="Visa Guidance"
            description="Get profile-strength guidance for visa-oriented positioning."
            onRun={() => runTool(setRunningVisaGuidance, () => callTool("/api/career-tools/visa-guidance", { targetRole, location: targetLocation, resumeText }, setVisaGuidanceResult, "Failed to run visa guidance."), "Unable to run visa guidance.")}
            running={runningVisaGuidance}
            disabled={!targetRole.trim() || !targetLocation.trim()}
            buttonLabel="Run Visa Guidance"
            runningLabel="Guiding..."
            result={visaGuidanceResult}
            emptyMessage="No visa guidance yet."
          />
        </div>
      </section>

      <section className="career-lab-group">
        <div className="career-lab-group-header">
          <h2>Interview & Job Search Execution</h2>
        </div>
        <div className="career-lab-tools-grid">
          <ToolActionCard
            title="Interview Prep"
            description="Generate interview questions, weakness detection, and coaching priorities."
            onRun={() => runTool(setRunningInterviewPrep, () => callTool("/api/career-tools/interview-prep", { resumeText, jobDescription, answerText }, setInterviewResult, "Failed to run interview prep."), "Unable to run interview prep.")}
            running={runningInterviewPrep}
            disabled={!resumeText.trim() || !jobDescription.trim()}
            buttonLabel="Run Interview Prep"
            runningLabel="Preparing..."
            result={interviewResult}
            emptyMessage="No interview prep output yet."
          />
          <ToolActionCard
            title="Interview Drill Plan"
            description="Create a recurring drill schedule and question set for interview practice."
            onRun={() => runTool(setRunningInterviewDrill, () => callTool("/api/career-tools/interview-drill-plan", { jobDescription, targetRole, answerText }, setInterviewDrillResult, "Failed to generate interview drill plan."), "Unable to generate interview drill plan.")}
            running={runningInterviewDrill}
            disabled={!jobDescription.trim() && !targetRole.trim()}
            buttonLabel="Generate Interview Drill Plan"
            runningLabel="Drilling..."
            result={interviewDrillResult}
            emptyMessage="No interview drill plan yet."
          />
          <ToolActionCard
            title="Job Search Sprint"
            description="Create a weekly execution sprint for applications, outreach, and prep."
            onRun={() => runTool(setRunningJobSprint, () => callTool("/api/career-tools/job-search-sprint", { targetRole, location: targetLocation, resumeText }, setJobSprintResult, "Failed to generate job search sprint plan."), "Unable to generate job search sprint plan.")}
            running={runningJobSprint}
            disabled={!targetRole.trim()}
            buttonLabel="Build Job Search Sprint"
            runningLabel="Planning..."
            result={jobSprintResult}
            emptyMessage="No sprint plan yet."
          />
          <ToolActionCard
            title="Outreach Messages"
            description="Generate ready-to-use cold/warm outreach and referral ask messages."
            onRun={() => runTool(setRunningOutreachMessages, () => callTool("/api/career-tools/outreach-messages", { targetRole, location: targetLocation, resumeText }, setOutreachMessagesResult, "Failed to generate outreach messages."), "Unable to generate outreach messages.")}
            running={runningOutreachMessages}
            disabled={!targetRole.trim()}
            buttonLabel="Generate Outreach Messages"
            runningLabel="Writing..."
            result={outreachMessagesResult}
            emptyMessage="No outreach messages yet."
          />
          <ToolActionCard
            title="Offer Negotiation"
            description="Get compensation anchor guidance and practical negotiation scripts."
            onRun={() => runTool(setRunningNegotiationPrep, () => callTool("/api/career-tools/offer-negotiation", { targetRole, location: targetLocation, yearsExperience: Number(yearsExperience || 0) }, setNegotiationResult, "Failed to run offer negotiation prep."), "Unable to run offer negotiation prep.")}
            running={runningNegotiationPrep}
            disabled={!targetRole.trim()}
            buttonLabel="Prepare Offer Negotiation"
            runningLabel="Preparing..."
            result={negotiationResult}
            emptyMessage="No negotiation prep yet."
          />
          <ToolActionCard
            title="Personal Brand Audit"
            description="Improve personal positioning clarity and messaging consistency."
            onRun={() => runTool(setRunningBrandAudit, () => callTool("/api/career-tools/personal-brand-audit", { resumeText, targetRole }, setBrandAuditResult, "Failed to run personal brand audit."), "Unable to run personal brand audit.")}
            running={runningBrandAudit}
            disabled={!resumeText.trim()}
            buttonLabel="Run Personal Brand Audit"
            runningLabel="Auditing..."
            result={brandAuditResult}
            emptyMessage="No brand audit yet."
          />
        </div>
      </section>

      <section className="content-card career-lab-panel">
        <h3>Feature Progress</h3>
        <pre>{JSON.stringify(progress, null, 2)}</pre>
      </section>
    </div>
  );
}
