import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ROUTES } from "../../constants/routes";
import { getAuthHeaders } from "../../utils/auth";
import "./DashboardPages.css";

const ALLOWED_STYLES = ["modern", "corporate", "creative"];

function normalizeType(value) {
  const type = String(value || "").toLowerCase();
  if (type === "resume") return "resume";
  if (type === "cover-letter" || type === "cover_letter" || type === "coverletter") {
    return "cover-letter";
  }
  return "";
}

function getPreviewEndpoint(type, id, style) {
  if (type === "resume") {
    return `/api/resumes/${id}/preview?style=${style}`;
  }

  return `/api/cover-letters/${id}/preview?style=${style}`;
}

function getDownloadEndpoint(type, id, style) {
  if (type === "resume") {
    return `/api/resumes/${id}/download?style=${style}`;
  }

  return `/api/cover-letters/${id}/download?style=${style}`;
}

function getDocumentRoute(type, id) {
  if (type === "resume") {
    return `${ROUTES.RESUME_NEW}?resumeId=${id}`;
  }

  return `${ROUTES.COVERLETTER_NEW}?coverLetterId=${id}`;
}

export default function DocumentWorkspace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const type = normalizeType(searchParams.get("type"));
  const id = searchParams.get("id") || "";

  const [style, setStyle] = useState("modern");
  const [title, setTitle] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [chatPrompt, setChatPrompt] = useState("");

  const [loadingDocument, setLoadingDocument] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const documentLabel = useMemo(() => (type === "resume" ? "Resume" : "Cover Letter"), [type]);

  useEffect(() => {
    const styleFromQuery = (searchParams.get("style") || "").toLowerCase();
    if (ALLOWED_STYLES.includes(styleFromQuery)) {
      setStyle(styleFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!type || !id) {
      setError("Missing document type or id.");
      return;
    }

    let isMounted = true;

    async function fetchDocument() {
      setLoadingDocument(true);
      setError("");

      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/workspace/document?type=${type}&id=${id}&style=${style}`, {
          headers,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load document.");
        }

        if (!isMounted) return;
        setTitle(data?.title || "");
        setDocumentText(data?.text || "");
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || "Unable to load document.");
      } finally {
        if (isMounted) {
          setLoadingDocument(false);
        }
      }
    }

    fetchDocument();

    return () => {
      isMounted = false;
    };
  }, [type, id, style]);

  useEffect(() => {
    if (!type || !id) {
      setError("Missing document type or id.");
      return;
    }

    let isMounted = true;

    async function fetchPreview() {
      setLoadingPreview(true);
      setError("");

      try {
        const response = await fetch(getPreviewEndpoint(type, id, style), {
          headers: await getAuthHeaders(),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to load document preview.");
        }

        const html = await response.text();
        if (!isMounted) return;
        setPreviewHtml(html);
      } catch (err) {
        if (!isMounted) return;
        setPreviewHtml("");
        setError(err.message || "Unable to load document preview.");
      } finally {
        if (isMounted) {
          setLoadingPreview(false);
        }
      }
    }

    fetchPreview();

    return () => {
      isMounted = false;
    };
  }, [type, id, style, feedback]);

  const handleDownload = async () => {
    if (!type || !id) return;

    setLoadingDownload(true);
    setError("");

    try {
      const response = await fetch(getDownloadEndpoint(type, id, style), {
        headers: await getAuthHeaders(),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to download PDF.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${type}-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Unable to download PDF.");
    } finally {
      setLoadingDownload(false);
    }
  };

  const handleSave = async () => {
    if (!type || !id) return;

    setSavingDocument(true);
    setError("");
    setFeedback("");

    try {
      const response = await fetch("/api/workspace/document", {
        method: "PUT",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ type, id, style, text: documentText }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save changes.");
      }

      setTitle(data?.title || title);
      setDocumentText(data?.text || documentText);
      setFeedback("Changes saved.");
    } catch (err) {
      setError(err.message || "Unable to save changes.");
    } finally {
      setSavingDocument(false);
    }
  };

  const handleRewrite = async () => {
    if (!type || !id || !chatPrompt.trim()) return;

    setRewriting(true);
    setError("");
    setFeedback("");

    try {
      const response = await fetch("/api/workspace/ai-rewrite", {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ type, id, text: documentText, prompt: chatPrompt }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "AI rewrite failed.");
      }

      setDocumentText(data?.rewrittenText || documentText);
      setFeedback("AI suggestion applied to editor. Save to persist.");
      setChatPrompt("");
    } catch (err) {
      setError(err.message || "Unable to run AI rewrite.");
    } finally {
      setRewriting(false);
    }
  };

  const handleOpenFormEditor = () => {
    if (!type || !id) return;
    navigate(getDocumentRoute(type, id));
  };

  const promptSuggestions = [
    "Shorten this document to one page",
    "Improve ATS keywords for software engineering roles",
    "Make the tone more concise and confident",
  ];

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <h1 className="page-title">{documentLabel} Workspace</h1>
          <p className="page-subtitle">Iterate with AI on the left, preview the live document on the right.</p>
        </div>

        <div className="header-actions">
          <select value={style} onChange={(e) => setStyle(e.target.value)} className="btn">
            <option value="modern">Modern</option>
            <option value="corporate">Corporate</option>
            <option value="creative">Creative</option>
          </select>
          <button className="btn btn-outline" type="button" onClick={handleOpenFormEditor}>
            Open Form Editor
          </button>
          <button className="btn btn-outline" type="button" onClick={handleSave} disabled={savingDocument || loadingDocument}>
            {savingDocument ? "Saving..." : "Save"}
          </button>
          <button className="btn btn-dark" type="button" onClick={handleDownload} disabled={loadingDownload}>
            {loadingDownload ? "Downloading..." : "Download PDF"}
          </button>
        </div>
      </div>

      {error ? <div className="content-card error-message">{error}</div> : null}
      {feedback ? <div className="content-card">{feedback}</div> : null}

      <div className="workspace-layout">
        <section className="workspace-panel workspace-chat-panel">
          <h3>{title || `${documentLabel} Draft`}</h3>
          <p className="page-subtitle">Edit directly below, or use AI prompts to revise quickly.</p>

          <div className="chat-suggestions">
            {promptSuggestions.map((suggestion) => (
              <button key={suggestion} type="button" className="chat-suggestion-btn" onClick={() => setChatPrompt(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          <textarea
            className="workspace-editor"
            value={documentText}
            onChange={(e) => setDocumentText(e.target.value)}
            placeholder={`Write or refine your ${documentLabel.toLowerCase()}...`}
          />

          <div className="chat-input-row">
            <input
              type="text"
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              placeholder={`Ask AI to improve this ${documentLabel.toLowerCase()}...`}
              aria-label="AI chat prompt"
            />
            <button type="button" className="btn btn-dark" onClick={handleRewrite} disabled={rewriting || !chatPrompt.trim()}>
              {rewriting ? "Thinking..." : "Send"}
            </button>
          </div>
        </section>

        <section className="workspace-panel workspace-preview-panel">
          <h3>Live Preview</h3>
          {loadingPreview ? <p>Loading preview...</p> : null}
          {!loadingPreview && previewHtml ? (
            <iframe
              title={`${documentLabel} Preview`}
              srcDoc={previewHtml}
              style={{
                width: "100%",
                height: "100%",
                minHeight: "780px",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
              }}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}