import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaCrown, FaEdit, FaEllipsisV, FaEnvelope, FaFileAlt, FaPlus, FaTrashAlt } from "react-icons/fa";
import { NavLink, useNavigate } from "react-router-dom";

import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../../components/ui/LoadingState";
import PageHeader from "../../components/ui/PageHeader";
import { ROUTES } from "../../constants/routes";
import { useAuth } from "../../context/useAuth";
import { getAuthHeaders } from "../../utils/auth";
import "./DashboardShared.css";

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

function DocActionsMenu({
  menuId,
  openMenuId,
  setOpenMenuId,
  onOpen,
  onDelete,
  editLabel,
  title,
  deleting,
}) {
  const isOpen = openMenuId === menuId;

  return (
    <div className="doc-actions-menu">
      <button
        type="button"
        className="doc-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Open actions for ${title}`}
        onClick={() => setOpenMenuId((prev) => (prev === menuId ? null : menuId))}
      >
        <FaEllipsisV />
      </button>

      {isOpen ? (
        <div className="doc-actions-dropdown" role="menu">
          <button type="button" className="doc-action-item" role="menuitem" onClick={onOpen}>
            <FaEdit /> {editLabel}
          </button>
          <button
            type="button"
            className="doc-action-item danger"
            role="menuitem"
            onClick={onDelete}
            disabled={deleting}
          >
            <FaTrashAlt /> {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardHome() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const menuRef = useRef(null);

  const [resumes, setResumes] = useState([]);
  const [coverLetters, setCoverLetters] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState(null);

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

  const loadDocuments = useCallback(async () => {
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

      if (!resumesResponse.ok) throw new Error(resumesData?.error || "Failed to load resumes.");
      if (!coverLettersResponse.ok) throw new Error(coverLettersData?.error || "Failed to load cover letters.");

      setResumes(Array.isArray(resumesData) ? resumesData : []);
      setCoverLetters(Array.isArray(coverLettersData) ? coverLettersData : []);
    } catch (error) {
      setDocsError(error.message || "Unable to load your documents.");
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDeleteDocument = useCallback(async (type, id, title) => {
    const shouldDelete = window.confirm(`Delete "${title || "Untitled"}"? This action cannot be undone.`);
    if (!shouldDelete) return;

    setDeletingDocId(`${type}-${id}`);

    try {
      const headers = await getAuthHeaders();
      const endpoint = type === "resume" ? `/api/resumes/${id}` : `/api/cover-letters/${id}`;
      const response = await fetch(endpoint, { method: "DELETE", headers });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || `Failed to delete ${type}.`);
      }

      if (type === "resume") {
        setResumes((prev) => prev.filter((item) => item.id !== id));
      } else {
        setCoverLetters((prev) => prev.filter((item) => item.id !== id));
      }

      setOpenMenuId(null);
    } catch (error) {
      setDocsError(error.message || "Unable to delete document.");
    } finally {
      setDeletingDocId(null);
    }
  }, []);

  return (
    <div>
      <PageHeader title="My Documents" subtitle="Manage your resumes and cover letters" />

      <section className="content-section">
        {!isPaidPlan && (
          <div className="promo-card">
            <div className="promo-details">
              <div className="promo-icon">
                <FaCrown size={40} />
              </div>
              <div>
                <h3>Unlock Premium Features</h3>
                <p>Get unlimited downloads, advanced templates, and AI-powered suggestions.</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => navigate(ROUTES.PAYMENT)}>
              Upgrade Now
            </Button>
          </div>
        )}

        <div className="quick-actions">
          <NavLink to={ROUTES.RESUME_NEW} className="quick-card create-button">
            <div className="promo-details">
              <div className="icon">
                <FaFileAlt size={30} />
              </div>
              <div>
                <strong>Create New Resume</strong>
                <div className="page-subtitle">Start building your professional resume</div>
              </div>
            </div>
            <FaPlus size={24} />
          </NavLink>
          <NavLink to={ROUTES.COVERLETTER_NEW} className="quick-card create-button">
            <div className="promo-details">
              <div className="icon">
                <FaEnvelope size={30} />
              </div>
              <div>
                <strong>Create Cover Letter</strong>
                <div className="page-subtitle">Write a compelling cover letter</div>
              </div>
            </div>
            <FaPlus size={24} />
          </NavLink>
          <NavLink to={ROUTES.CAREER_LAB_ATS} className="quick-card create-button">
            <div className="promo-details">
              <div className="icon">
                <FaEdit size={30} />
              </div>
              <div>
                <strong>Open Career Lab</strong>
                <div className="page-subtitle">Open separated Career Lab tool pages</div>
              </div>
            </div>
            <FaPlus size={24} />
          </NavLink>
        </div>
      </section>

      {docsError ? (
        <ErrorState
          title="Could not complete request"
          description={docsError}
          action={
            <Button variant="secondary" onClick={loadDocuments}>
              Retry
            </Button>
          }
        />
      ) : null}

      <div ref={menuRef}>
        <section className="content-section">
          <div className="section-title">
            <h3>My Resumes</h3>
            <span className="section-count">{resumeCountLabel}</span>
          </div>

          <div className="document-grid">
            {loadingDocs ? (
              <LoadingState rows={4} />
            ) : resumes.length === 0 ? (
              <EmptyState
                title="No resumes yet"
                description="Create your first resume to get started."
                action={
                  <Button as={NavLink} to={ROUTES.RESUME_NEW}>
                    Create Resume
                  </Button>
                }
              />
            ) : (
              resumes.map((resume) => {
                const menuId = `resume-${resume.id}`;
                const isDeleting = deletingDocId === menuId;

                return (
                  <div className="doc-card" key={resume.id}>
                    <div className="doc-card-top">
                      <div className="doc-icon">
                        <FaFileAlt size={30} />
                      </div>
                      <DocActionsMenu
                        menuId={menuId}
                        openMenuId={openMenuId}
                        setOpenMenuId={setOpenMenuId}
                        onOpen={() => navigate(`${ROUTES.DOCUMENT_WORKSPACE}?type=resume&id=${resume.id}`)}
                        onDelete={() => handleDeleteDocument("resume", resume.id, resume.title)}
                        editLabel="Open"
                        title={resume.title || "resume"}
                        deleting={isDeleting}
                      />
                    </div>
                    <strong>{resume.title || "Untitled Resume"}</strong>
                    <p className="doc-meta">{getResumePreviewText(resume)}</p>
                    <div className="doc-footer">
                      <span>Edited {formatLastEdited(resume.last_edited_at || resume.updated_at)}</span>
                    </div>
                  </div>
                );
              })
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
              <LoadingState rows={4} />
            ) : coverLetters.length === 0 ? (
              <EmptyState
                title="No cover letters yet"
                description="Create one to start applying faster."
                action={
                  <Button as={NavLink} to={ROUTES.COVERLETTER_NEW}>
                    Create Cover Letter
                  </Button>
                }
              />
            ) : (
              coverLetters.map((coverLetter) => {
                const menuId = `cover-letter-${coverLetter.id}`;
                const isDeleting = deletingDocId === menuId;

                return (
                  <div className="doc-card" key={coverLetter.id}>
                    <div className="doc-card-top">
                      <div className="doc-icon">
                        <FaEnvelope size={30} />
                      </div>
                      <DocActionsMenu
                        menuId={menuId}
                        openMenuId={openMenuId}
                        setOpenMenuId={setOpenMenuId}
                        onOpen={() => navigate(`${ROUTES.DOCUMENT_WORKSPACE}?type=cover-letter&id=${coverLetter.id}`)}
                        onDelete={() => handleDeleteDocument("cover-letter", coverLetter.id, coverLetter.title)}
                        editLabel="Edit"
                        title={coverLetter.title || "cover letter"}
                        deleting={isDeleting}
                      />
                    </div>
                    <strong>{coverLetter.title || "Untitled Cover Letter"}</strong>
                    <p className="doc-meta">{getCoverLetterPreviewText(coverLetter)}</p>
                    <div className="doc-footer">
                      <span>Edited {formatLastEdited(coverLetter.last_edited_at || coverLetter.updated_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
