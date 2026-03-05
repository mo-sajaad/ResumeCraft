import { useState, useEffect } from "react";
import PersonalInfoCard from "../../components/Resume/PersonalInfoCard";
import SkillsCard from "../../components/Resume/SkillsCard";
import ExperienceCard from "../../components/Resume/ExperienceCard";
import EducationCard from "../../components/Resume/EducationCard";
import ProjectsCard from "../../components/Resume/ProjectsCard";

import { getAuthHeaders } from "../../utils/auth";

export default function ResumeNew() {
  // PERSONAL INFO
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");


  // STYLE (Template)
  const [style, setStyle] = useState("modern");

  // SKILLS
  const [skills, setSkills] = useState(["JavaScript", "React", "Node.js", "HTML", "CSS"]);

  // EXPERIENCE / EDUCATION / PROJECTS
  const [workExperience, setWorkExperience] = useState([]);
  const [education, setEducation] = useState([]);
  const [projects, setProjects] = useState([]);

  // UI STATE
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resumeId, setResumeId] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);

  // VALIDATION
  const validate = () => {
    if (!fullName.trim()) return "Full name is required";
    if (!email.trim()) return "Email is required";
    if (skills.length === 0) return "Add at least one skill";

    if ( workExperience.length === 0 && education.length === 0 && projects.length === 0) {
      return "Add at least one experience, education or project";
    }

    return null;
  };


  // FETCH PREVIEW
  const fetchResumePreview = async (targetResumeId, targetStyle) => {
    if (!targetResumeId) return;

    setLoadingPreview(true);

    try {
      const response = await fetch(`/api/resumes/${targetResumeId}/preview?style=${targetStyle}`, {
        headers: await getAuthHeaders(),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load resume preview");
      }

      const html = await response.text();
      setPreviewHtml(html);
    } catch (err) {
      setPreviewHtml("");
      setError(err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (!resumeId) return;
    fetchResumePreview(resumeId, style);
  }, [resumeId, style]);

  // GENERATE RESUME
  const handleGenerateResume = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setLoading(true);
    setResumeId(null);
    setPreviewHtml("");

    const payload = {
      personal: { fullName, email, phoneNumber, location, linkedin },
      skills,
      experience: workExperience,
      education,
      projects,
      style,
    };

    try {
      const res = await fetch("/api/resumes/generate", {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(data.error || "You’ve reached your monthly limit or your plan cannot use this template.");
        }
        throw new Error(data.error || "Failed to generate resume");
      }

      setResumeId(data.resumeId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // DOWNLOAD PDF
  const handleDownloadPDF = async () => {
    if (!resumeId) return;

    setError("");
    setDownloadingPdf(true);

    try {
      const response = await fetch(`/api/resumes/${resumeId}/download?style=${style}`, {
        headers: await getAuthHeaders(),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to download resume PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resume-${resumeId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // UI
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Create Resume</h1>

        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {/* Template Selector */}
          <select value={style} onChange={(e) => setStyle(e.target.value)} className="input">
            <option value="modern">Modern</option>
            <option value="corporate">Corporate</option>
            <option value="creative">Creative</option>
          </select>

          <button className="btn btn-primary" onClick={handleGenerateResume} disabled={loading}>
            {loading ? "Generating..." : "Generate Resume"}
          </button>

          {resumeId && (
            <button
              className="btn btn-secondary"
              onClick={handleDownloadPDF}
              disabled={downloadingPdf}
            >
              {downloadingPdf ? "Downloading..." : "Download PDF"}
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>}

      {/* FORM */}
      <div className="form-stack">
        <div className="form-grid">
          <PersonalInfoCard
            fullName={fullName}
            setFullName={setFullName}
            email={email}
            setEmail={setEmail}
            phoneNumber={phoneNumber}
            setPhoneNumber={setPhoneNumber}
            location={location}
            setLocation={setLocation}
            linkedin={linkedin}
            setLinkedin={setLinkedin}
          />

          <SkillsCard skills={skills} setSkills={setSkills} />
        </div>

        <ExperienceCard workExperience={workExperience} setWorkExperience={setWorkExperience} />
        <EducationCard education={education} setEducation={setEducation} />
        <ProjectsCard projects={projects} setProjects={setProjects} />
      </div>

      {/* TEMPLATE PREVIEW */}
      {resumeId && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Resume Preview</h2>

          {loadingPreview ? <p>Loading preview...</p> : null}
          {!loadingPreview && previewHtml ? (
            <iframe
              title="Resume Preview"
              srcDoc={previewHtml}
              style={{
                width: "100%",
                height: "1000px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                marginTop: "1rem",
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}