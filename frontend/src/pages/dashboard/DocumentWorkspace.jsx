import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ROUTES } from "../../constants/routes";
import { getAuthHeaders } from "../../utils/auth";
import "./DashboardPages.css";

const ALLOWED_STYLES = ["modern", "corporate", "creative"];

function normalizeType(value) {
  const type = String(value || "").toLowerCase();
  if (type === "resume") return "resume";
  if (type === "cover-letter" || type === "cover_letter" || type === "coverletter") return "cover-letter";
  return "";
}

function getDownloadEndpoint(type, id, style) {
  if (type === "resume") {
    return `/api/resumes/${id}/download?style=${style}`;
  }

  return `/api/cover-letters/${id}/download?style=${style}`;
}

function getDocumentEndpoint(type, id) {
  if (type === "resume") {
    return `/api/resumes/${id}`;
  }

  return `/api/cover-letters/${id}`;
}

function getDocumentRoute(type, id) {
  return type === "resume" ? `${ROUTES.RESUME_NEW}?resumeId=${id}` : `${ROUTES.COVERLETTER_NEW}?coverLetterId=${id}`;
}

function extractLegacyText(type, data) {
  if (type === "resume") {
    if (typeof data?.summary === "string") return data.summary;
    if (typeof data?.generated_text === "string") {
      try {
        const parsed = JSON.parse(data.generated_text);
        if (typeof parsed?.summary === "string") return parsed.summary;
      } catch {
        return data.generated_text;
      }
    }
    return "";
  }

  if (typeof data?.body_paragraphs === "string") return data.body_paragraphs;
  if (typeof data?.generated_text === "string") {
    try {
      const parsed = JSON.parse(data.generated_text);
      if (typeof parsed?.body === "string") return parsed.body;
    } catch {
      return data.generated_text;
    }
  }

  return "";
}

function plainTextToHtml(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "<p><br/></p>";

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function htmlToPlainText(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return (temp.textContent || temp.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
}

async function fetchLegacyDocument(type, id) {
  const response = await fetch(getDocumentEndpoint(type, id), { headers: await getAuthHeaders() });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) throw new Error(data?.error || "Failed to load document.");

  return {
    title: data?.title || "",
    text: extractLegacyText(type, data),
  };
}

async function saveLegacyDocument(type, id, title, text, style) {
  const body =
    type === "resume"
      ? { title, summary: text, generated_text: { summary: text }, template_key: style }
      : { title, body_paragraphs: text, generated_text: { body: text } };

  const response = await fetch(getDocumentEndpoint(type, id), {
    method: "PUT",
    headers: await getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Failed to save changes.");

  return {
    title: data?.title || title,
    text: extractLegacyText(type, data) || text,
  };
}

function extractLegacyText(type, data) {
  if (type === "resume") {
    if (typeof data?.summary === "string") return data.summary;
    if (typeof data?.generated_text === "string") {
      try {
        const parsed = JSON.parse(data.generated_text);
        if (typeof parsed?.summary === "string") return parsed.summary;
      } catch {
        return data.generated_text;
      }
    }
    return "";
  }

  if (typeof data?.body_paragraphs === "string") return data.body_paragraphs;
  if (typeof data?.generated_text === "string") {
    try {
      const parsed = JSON.parse(data.generated_text);
      if (typeof parsed?.body === "string") return parsed.body;
    } catch {
      return data.generated_text;
    }
  }

  return "";
}

function plainTextToHtml(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "<p><br/></p>";

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function htmlToPlainText(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return (temp.textContent || temp.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
}

async function fetchLegacyDocument(type, id) {
  const endpoint = type === "resume" ? `/api/resumes/${id}` : `/api/cover-letters/${id}`;
  const response = await fetch(endpoint, { headers: await getAuthHeaders() });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "Failed to load document.");
  }

  return {
    title: data?.title || "",
    text: extractLegacyText(type, data),
  };
}

async function saveLegacyDocument(type, id, title, text, style) {
  const endpoint = type === "resume" ? `/api/resumes/${id}` : `/api/cover-letters/${id}`;

  const body =
    type === "resume"
      ? { title, summary: text, generated_text: { summary: text }, template_key: style }
      : { title, body_paragraphs: text, generated_text: { body: text } };

  const response = await fetch(endpoint, {
    method: "PUT",
    headers: await getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "Failed to save changes.");
  }

  return {
    title: data?.title || title,
    text: extractLegacyText(type, data) || text,
  };
}

export default function DocumentWorkspace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editorRef = useRef(null);

  const type = normalizeType(searchParams.get("type"));
  const id = searchParams.get("id") || "";

  const [style, setStyle] = useState("modern");
  const [title, setTitle] = useState("");
  const [documentHtml, setDocumentHtml] = useState("<p><br/></p>");
  const [chatPrompt, setChatPrompt] = useState("");

  const [loadingDocument, setLoadingDocument] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const documentLabel = useMemo(() => (type === "resume" ? "Resume" : "Cover Letter"), [type]);

  useEffect(() => {
    const styleFromQuery = (searchParams.get("style") || "").toLowerCase();
    if (ALLOWED_STYLES.includes(styleFromQuery)) setStyle(styleFromQuery);
  }, [searchParams]);

  useEffect(() => {
    if (!type || !id) {
      setError("Missing document type or id.");
      return;
    }

    let isMounted = true;

    async function loadWorkspace() {
      setLoadingDocument(true);
      setError("");

      try {
        const legacyData = await fetchLegacyDocument(type, id);

        if (!isMounted) return;
        setTitle(legacyData.title);
        setDocumentHtml(plainTextToHtml(legacyData.text));
      } catch {
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
          setDocumentHtml(plainTextToHtml(data?.text || ""));
        } catch (err) {
          if (!isMounted) return;
          setError(err.message || "Unable to load document.");
        }
      } finally {
        if (isMounted) {
          setLoadingDocument(false);
        }
      }

    fetchDocument();

    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      if (iframe._cleanup) iframe._cleanup();
    };
  }, [type, id, style, refreshTick]);

  const handleDownload = async () => {
    if (!type || !id) return;
    setLoadingDownload(true);
    setError("");

    try {
      const response = await fetch(getDownloadEndpoint(type, id, style), { headers: await getAuthHeaders() });
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

    const documentText = htmlToPlainText(documentHtml);

    try {
      const response = await fetch("/api/workspace/document", {
        method: "PUT",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ type, id, style, text }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const legacySaved = await saveLegacyDocument(type, id, title, documentText, style);
        setTitle(legacySaved.title);
        setDocumentHtml(plainTextToHtml(legacySaved.text));
        setFeedback("Changes saved.");
        return;
      }

      setTitle(data?.title || title);
      setDocumentHtml(plainTextToHtml(data?.text || documentText));
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

    const currentText = htmlToPlainText(documentHtml);

    try {
      const response = await fetch("/api/workspace/ai-rewrite", {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ type, id, text: currentText, prompt: chatPrompt }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "AI rewrite failed.");

      const rewrittenHtml = plainTextToHtml(data?.rewrittenText || currentText);
      setDocumentHtml(rewrittenHtml);
      if (iframeRef.current?.contentDocument?.body) {
        iframeRef.current.contentDocument.body.innerHTML = rewrittenHtml;
      }

      const rewrittenText = data?.rewrittenText || currentText;
      setDocumentHtml(plainTextToHtml(rewrittenText));
      setFeedback("AI suggestion applied to the editor. Save to persist.");
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

  const handleRefreshDocument = () => {
    setError("");
    setFeedback("");
    setRefreshTick((value) => value + 1);
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(htmlToPlainText(documentHtml));
      setFeedback("Document text copied to clipboard.");
    } catch {
      setError("Unable to copy to clipboard in this browser.");
    }
  };

  const handleDeleteDocument = async () => {
    if (!type || !id || deletingDocument) return;

    const confirmed = window.confirm(`Delete this ${documentLabel.toLowerCase()}? This action cannot be undone.`);
    if (!confirmed) return;

    setDeletingDocument(true);
    setError("");
    setFeedback("");

    try {
      const response = await fetch(getDocumentEndpoint(type, id), {
        method: "DELETE",
        headers: await getAuthHeaders(),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete document.");
      }

      navigate(ROUTES.DASHBOARD);
    } catch (err) {
      setError(err.message || "Unable to delete document.");
    } finally {
      setDeletingDocument(false);
    }
  };

  const applyFormatting = (command) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, null);
    setDocumentHtml(editorRef.current.innerHTML || "<p><br/></p>");
  };

  const promptSuggestions = [
    "Shorten this document to one page",
    "Improve ATS keywords for software engineering roles",
    "Make the tone more concise and confident",
    "Rewrite this for a product manager role",
  ];

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <h1 className="page-title">{documentLabel} Workspace</h1>
          <p className="page-subtitle">Google Docs-style editing with AI assistant suggestions.</p>
        </div>

        <div className="header-actions workspace-header-actions">
          <div className="workspace-action-group workspace-action-group-primary">
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="btn workspace-style-select">
              <option value="modern">Modern</option>
              <option value="corporate">Corporate</option>
              <option value="creative">Creative</option>
            </select>
            <button className="btn btn-outline" type="button" onClick={handleSave} disabled={savingDocument || loadingDocument}>
              {savingDocument ? "Saving..." : "Save"}
            </button>
            <button className="btn btn-dark" type="button" onClick={handleDownload} disabled={loadingDownload}>
              {loadingDownload ? "Downloading..." : "Download PDF"}
            </button>
          </div>

          <details className="workspace-more-actions">
            <summary className="btn btn-outline">More actions</summary>
            <div className="workspace-more-actions-menu">
              <button className="btn btn-outline" type="button" onClick={handleOpenFormEditor}>
                Open Form Editor
              </button>
              <button className="btn btn-outline" type="button" onClick={handleRefreshDocument} disabled={loadingDocument}>
                Refresh
              </button>
              <button className="btn btn-outline" type="button" onClick={handleCopyText}>
                Copy Text
              </button>
              <button className="btn btn-danger" type="button" onClick={handleDeleteDocument} disabled={deletingDocument}>
                {deletingDocument ? "Deleting..." : "Delete"}
              </button>
            </div>
          </details>
        </div>
      </div>

      {error ? <div className="content-card error-message">{error}</div> : null}
      {feedback ? <div className="content-card">{feedback}</div> : null}

      <div className="workspace-layout workspace-layout-single-editor">
        <section className="workspace-panel workspace-chat-panel">
          <h3>AI Chat Assistant</h3>
          <p className="page-subtitle">Ask AI to improve, tailor, or shorten your document.</p>

          <div className="chat-suggestions">
            {promptSuggestions.map((suggestion) => (
              <button key={suggestion} type="button" className="chat-suggestion-btn" onClick={() => setChatPrompt(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          <div className="chat-history-placeholder">
            AI responses are applied to the live document editor.
          </div>

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
          <h3>{title || `${documentLabel} Draft`}</h3>
          <p className="page-subtitle">Edit the final formatted document directly.</p>

          <div className="workspace-editor-toolbar">
            <button type="button" className="btn btn-outline" onClick={() => applyFormatting("bold")}>B</button>
            <button type="button" className="btn btn-outline" onClick={() => applyFormatting("italic")}>I</button>
            <button type="button" className="btn btn-outline" onClick={() => applyFormatting("underline")}>U</button>
            <button type="button" className="btn btn-outline" onClick={() => applyFormatting("insertUnorderedList")}>• List</button>
          </div>

          <div
            ref={editorRef}
            className="workspace-rich-editor"
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setDocumentHtml(e.currentTarget.innerHTML || "<p><br/></p>")}
            dangerouslySetInnerHTML={{ __html: documentHtml }}
          />
        </section>
      </div>
    </div>
  );
}
