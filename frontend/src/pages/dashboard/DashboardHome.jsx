import { useEffect, useMemo, useState } from "react";
import { FaCrown, FaEdit, FaFileAlt, FaEnvelope, FaPlus } from "react-icons/fa";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/useAuth";
import { ROUTES } from "../../constants/routes";
import { getAuthHeaders } from "../../utils/auth";
import "./DashboardPages.css";


function formatLastEdited(dateValue) {
  if (!dateValue) return "Unknown";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString();
}

function truncateText(text, maxLength = 160) {
  const safeText = String(text || "").replace(/\s+/g, " ").trim();
  if (!safeText) return "";
  if (safeText.length <= maxLength) return safeText;
  return `${safeText.slice(0, maxLength).trim()}…`;
}

function getResumePreviewText(resume) {
  if (resume?.summary?.trim()) return truncateText(resume.summary);
  if (resume?.generated_text?.trim()) return truncateText(resume.generated_text);
  return "No summary available.";
}

function getCoverLetterPreviewText(coverLetter) {
  if (coverLetter?.body_paragraphs?.trim()) return truncateText(coverLetter.body_paragraphs);
  if (coverLetter?.generated_text?.trim()) {
    try {
      const parsed = JSON.parse(coverLetter.generated_text);
      if (typeof parsed?.body === "string" && parsed.body.trim()) {
        return truncateText(parsed.body);
      }
    } catch {
      return truncateText(coverLetter.generated_text);
    }
  }

  return "No cover letter content available.";
}

export default function DashboardHome() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [resumes, setResumes] = useState([]);
  const [coverLetters, setCoverLetters] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [_docsError, setDocsError] = useState("");

  const activePlanCode = (profile?.plan_code || "free").toLowerCase();
  const isPaidPlan = activePlanCode === "premium" || activePlanCode === "pro";

  const resumeCountLabel = useMemo(
    () => `${resumes.length} resume${resumes.length === 1 ? "" : "s"}`,
    [resumes.length]
  );

  const coverLetterCountLabel = useMemo(
    () => `${coverLetters.length} cover letter${coverLetters.length === 1 ? "" : "s"}`,
    [coverLetters.length]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadDocuments() {
      setLoadingDocs(true);
      setDocsError("");

      try {
        const headers = await getAuthHeaders();
        const [resumesResponse, coverLettersResponse] = await Promise.all([
          fetch("/api/resumes", { headers }),
          fetch("/api/cover-letters", { headers }),
        ]);

        const resumesData = await resumesResponse.json().catch(() => []);
        const coverLettersData = await coverLettersResponse.json().catch(() => []);

        if (!resumesResponse.ok) {
          throw new Error(resumesData?.error || "Failed to load resumes.");
        }

        if (!coverLettersResponse.ok) {
          throw new Error(coverLettersData?.error || "Failed to load cover letters.");
        }

        if (!isMounted) return;

        setResumes(Array.isArray(resumesData) ? resumesData : []);
        setCoverLetters(Array.isArray(coverLettersData) ? coverLettersData : []);
      } catch (error) {
        if (!isMounted) return;
        setDocsError(error.message || "Unable to load your documents.");
      } finally {
        if (isMounted) {
          setLoadingDocs(false);
        }
      }
    }

    loadDocuments();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUpgrade = () => {
    navigate(ROUTES.PAYMENT);
  };

  const openResumeEditor = (resumeId) => {
    navigate(`${ROUTES.DOCUMENT_WORKSPACE}?type=resume&id=${resumeId}`);
  };

  const openCoverLetterEditor = (coverLetterId) => {
    navigate(`${ROUTES.DOCUMENT_WORKSPACE}?type=cover-letter&id=${coverLetterId}`);
  };
  
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Documents</h1>
          <p className="page-subtitle">Manage your resumes and cover letters</p>
        </div>
      </div>

      <section className="content-section">
        {!isPaidPlan && (
          <div className="promo-card">
            <div className="promo-details">
              <div className="promo-icon">
                <FaCrown size={40} />
              </div>
              <div>
                <h3>Unlock Premium Features</h3>
                <p>
                  Get unlimited downloads, advanced templates, and AI-powered
                  suggestions.
                </p>
              </div>
            </div>
            <button className="btn btn-outline" onClick={handleUpgrade}>
              Upgrade Now
            </button>
          </div>

        )}

        <div className="quick-actions">
          {/* Create New Resume */}
          <NavLink
            to={ROUTES.RESUME_NEW}
            className="quick-card create-button"
          >
            <div className="promo-details">
              <div className="icon">
                <FaFileAlt size={30} />
              </div>
              <div>
                <strong>Create New Resume</strong>
                <div className="page-subtitle">
                  Start building your professional resume
                </div>
              </div>
            </div>
            <FaPlus size={24} />
          </NavLink>

          {/* Create Cover Letter */}
          <NavLink
            to={ROUTES.COVERLETTER_NEW}
            className="quick-card create-button"
          >
            <div className="promo-details">
              <div className="icon">
                <FaEnvelope size={30} />
              </div>
              <div>
                <strong>Create Cover Letter</strong>
                <div className="page-subtitle">
                  Write a compelling cover letter
                </div>
              </div>
            </div>
            <FaPlus size={24} />
          </NavLink>
        </div>
      </section>

      <section className="content-section">
        <div className="section-title">
          <h3>My Resumes</h3>
          <span className="section-count">{resumeCountLabel}</span>
        </div>

        <div className="document-grid">
          {loadingDocs ? (
            <div className="content-card">Loading resumes...</div>
          ) : resumes.length === 0 ? (
            <div className="content-card">No resumes yet. Create your first resume to get started.</div>
          ) : (
            resumes.map((resume) => (
              <div className="doc-card" key={resume.id}>
                <div className="doc-icon">
                  <FaFileAlt size={30} />
                </div>
                <strong>{resume.title || "Untitled Resume"}</strong>
                <p className="doc-meta">{getResumePreviewText(resume)}</p>
                <div className="doc-footer">
                  <span>Edited {formatLastEdited(resume.last_edited_at || resume.updated_at)}</span>
                  <button
                    className="btn btn-outline"
                    onClick={() => openResumeEditor(resume.id)}
                    type="button"
                  >
                    <FaEdit /> Open
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="content-section">
        <div className="section-title">
          <h3>My Cover Letters</h3>
          <span className="section-count">{coverLetterCountLabel}</span>
        </div>

        <div className="document-grid">
          {loadingDocs ? (
            <div className="content-card">Loading cover letters...</div>
          ) : coverLetters.length === 0 ? (
            <div className="content-card">No cover letters yet. Create one to get started.</div>
          ) : (
            coverLetters.map((coverLetter) => (
              <div className="doc-card" key={coverLetter.id}>
                <div className="doc-icon">
                  <FaEnvelope size={30} />
                </div>
                <strong>{coverLetter.title || "Untitled Cover Letter"}</strong>
                <p className="doc-meta">{getCoverLetterPreviewText(coverLetter)}</p>
                <div className="doc-footer">
                  <span>
                    Edited {formatLastEdited(coverLetter.last_edited_at || coverLetter.updated_at)}
                  </span>
                  <button
                    className="btn btn-outline"
                    onClick={() => openCoverLetterEditor(coverLetter.id)}
                    type="button"
                  >
                    <FaEdit />  Edit
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
