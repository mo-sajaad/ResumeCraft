import { useState, useEffect } from "react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import "./DashboardPages.css";
import { getAuthHeaders } from "../../utils/auth";

export default function CoverLetterNew() {
  // PERSONAL INFO
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");

  // JOB INFO
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [manager, setManager] = useState("");

  // UI STATE
  const [style, setStyle] = useState("modern");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedLetter, setGeneratedLetter] = useState("");
  const [coverLetterId, setCoverLetterId] = useState(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Fetch latest resume on mount to prefill personal info
  useEffect(() => {
    const fetchLatestResume = async () => {
      try {
        const res = await fetch("/api/resumes", {
          headers: await getAuthHeaders(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load resume");

        const latestResume = Array.isArray(data) ? data[0] : null;

        if (latestResume) {
          setFullName(latestResume.full_name || "");
          setEmail(latestResume.email || "");
          setPhoneNumber(latestResume.phone_e164 || "");
          setAddress(latestResume.location_text || "");
        }
      } catch (err) {
        console.warn("Could not preload resume:", err.message);
      }
    };

    fetchLatestResume();
  }, []);

  useEffect(() => {
    if (!coverLetterId) return;

    const fetchPreview = async () => {
      setLoadingPreview(true);

      try {
        const res = await fetch(`/api/cover-letters/${coverLetterId}/preview?style=${style}`, {
          headers: await getAuthHeaders(),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load cover letter preview");
        }

        const html = await res.text();
        setPreviewHtml(html);
      } catch (err) {
        setPreviewHtml("");
        setError(err.message);
      } finally {
        setLoadingPreview(false);
      }
    };

    fetchPreview();
  }, [coverLetterId, style]);


  const validate = () => {
    if (!fullName.trim()) return "Full name is required";
    if (!email.trim()) return "Email is required";
    if (!company.trim()) return "Company name is required";
    if (!position.trim()) return "Position is required";
    return null;
  };


  const handleGenerateCoverLetter = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setLoading(true);
    setGeneratedLetter("");
    setCoverLetterId(null);
    setPreviewHtml("");

    const payload = {
      personal: { fullName, email, phoneNumber, address },
      job: { company, position, manager },
      experience: [],
      education: [],
      projects: [],
      style,
    };

    try {
      const res = await fetch("/api/cover-letters/generate", {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(data.error || "You’ve reached your monthly limit or your plan cannot use this template.");
        }
        throw new Error(data.error || "Failed to generate cover letter");
      }

      setGeneratedLetter(data.coverLetterText || "");
      setCoverLetterId(data.coverLetterId || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!coverLetterId) return;

    setError("");
    setDownloadingPdf(true);

    try {
      const response = await fetch(`/api/cover-letters/${coverLetterId}/download?style=${style}`, {
        headers: await getAuthHeaders(),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to download cover letter PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cover-letter-${coverLetterId}.pdf`;
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

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Create Cover Letter</h1>
        <div className="header-actions">
          <select value={style} onChange={(e) => setStyle(e.target.value)} className="input">
            <option value="modern">Modern</option>
            <option value="corporate">Corporate</option>
            <option value="creative">Creative</option>
          </select>

          <button className="btn btn-dark" onClick={handleGenerateCoverLetter} disabled={loading}>
            {loading ? "Generating..." : "Generate Cover Letter"}
          </button>

          {coverLetterId ? (
            <button className="btn btn-outline" onClick={handleDownloadPDF} disabled={downloadingPdf}>
              {downloadingPdf ? "Downloading..." : "Download PDF"}
            </button>
          ) : null}
        </div>
      </div>

      {error && <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>}

      <div className="form-stack">
        <div className="content-card">
          <h3>Your Information</h3>
          <div className="input-group form-padding">
            <label>Full Name</label>
            <input placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Email</label>
            <input placeholder="john.doe@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Phone</label>
            <PhoneInput
              international
              defaultCountry="US"
              value={phoneNumber}
              onChange={setPhoneNumber}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className="input-group">
            <label>Address</label>
            <input
              placeholder="123 Main St, San Francisco, CA"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        </div>

        <div className="content-card">
          <h3>Job Details</h3>
          <div className="input-group form-padding">
            <label>Company Name</label>
            <input placeholder="Tech Corp" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Position</label>
            <input
              placeholder="Senior Software Engineer"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Hiring Manager (Optional)</label>
            <input placeholder="Jane Smith" value={manager} onChange={(e) => setManager(e.target.value)} />
          </div>
        </div>
      </div>

      {generatedLetter ? (
        <div style={{ marginTop: "2rem" }}>
          <h2>Generated Cover Letter</h2>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#f5f5f5",
              padding: "1rem",
              borderRadius: "8px",
            }}
          >
            {generatedLetter}
          </pre>
        </div>
      ) : null}

      {coverLetterId ? (
        <div style={{ marginTop: "2rem" }}>
          <h2>Cover Letter Preview</h2>
          {loadingPreview ? <p>Loading preview...</p> : null}
          {!loadingPreview && previewHtml ? (
            <iframe
              title="Cover Letter Preview"
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
      ) : null}
    </div>
  );
}
