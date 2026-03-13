import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PersonalInfoCard from "../../components/Resume/PersonalInfoCard";
import SkillsCard from "../../components/Resume/SkillsCard";
import ExperienceCard from "../../components/Resume/ExperienceCard";
import EducationCard from "../../components/Resume/EducationCard";
import ProjectsCard from "../../components/Resume/ProjectsCard";

import { getAuthHeaders } from "../../utils/auth";
import { ROUTES } from "../../constants/routes";


function parseResumeGeneratedData(rawGeneratedText) {
  if (!rawGeneratedText) {
    return { summary: "", skills: [], experience: [], education: [], projects: [] };
  }

  try {
    const parsed = JSON.parse(rawGeneratedText);
    return {
      summary: parsed?.summary || "",
      skills: Array.isArray(parsed?.skills) ? parsed.skills : [],
      experience: Array.isArray(parsed?.experience) ? parsed.experience : [],
      education: Array.isArray(parsed?.education) ? parsed.education : [],
      projects: Array.isArray(parsed?.projects) ? parsed.projects : [],
    };
  } catch {
    return { summary: "", skills: [], experience: [], education: [], projects: [] };
  }
}

export default function ResumeNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedResumeId = searchParams.get("resumeId");

  // PERSONAL INFO
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const styles = [
    { value: "modern", label: "Modern" },
    { value: "corporate", label: "Corporate" },
    { value: "creative", label: "Creative" }
  ];


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

    if (workExperience.length === 0 && education.length === 0 && projects.length === 0) {
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
    if (!requestedResumeId) return;

    let isMounted = true;

    async function loadExistingResume() {
      setError("");

      try {
        const response = await fetch(`/api/resumes/${requestedResumeId}`, {
          headers: await getAuthHeaders(),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load resume");
        }

        if (!isMounted) return;

        const generated = parseResumeGeneratedData(data.generated_text);

        setResumeId(data.id || requestedResumeId);
        setFullName(data.full_name || "");
        setEmail(data.email || "");
        setPhoneNumber(data.phone_e164 || "");
        setLocation(data.location_text || "");
        setLinkedin(data.linkedin_url || "");
        setStyle(data.template_key || "modern");
        setSkills(generated.skills.length ? generated.skills : []);
        setWorkExperience(generated.experience);
        setEducation(generated.education);
        setProjects(generated.projects);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || "Unable to open resume.");
      }
    }

    loadExistingResume();

    return () => {
      isMounted = false;
    };
  }, [requestedResumeId]);

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
      navigate(`${ROUTES.DOCUMENT_WORKSPACE}?type=resume&id=${data.resumeId}&style=${style}`);
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
          <div className="dropdown">
        <button className="btn dropdown-toggle" onClick={() => setDropdownOpen(!dropdownOpen)}>
              {styles.find((s) => s.value === style)?.label}
              <span className="dropdown-arrow">▾</span>
            </button>

            {dropdownOpen && (
              <div className="dropdown-menu">
                {styles.map((s) => (
                  <div
                    key={s.value}
                    className={`dropdown-item ${style === s.value ? "active" : ""}`}
                    onClick={() => {
                      setStyle(s.value);
                      setDropdownOpen(false);
                    }}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="btn btn-dark" onClick={handleGenerateResume} disabled={loading}>
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