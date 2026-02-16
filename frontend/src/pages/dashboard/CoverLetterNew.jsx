import { useState, useEffect } from "react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import "./DashboardPages.css";

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

  // PRELOADED RESUME DATA
  const [experience, setExperience] = useState([]);
  const [education, setEducation] = useState([]);
  const [projects, setProjects] = useState([]);

  // UI STATE
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedLetter, setGeneratedLetter] = useState("");

  // Fetch latest resume on mount to prefill personal info
  useEffect(() => {
    const fetchLatestResume = async () => {
      try {
        const token = localStorage.getItem("jwtToken");
        const res = await fetch("/api/resumes/latest", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load resume");

        if (data.resume) {
          setFullName(data.resume.full_name || "");
          setEmail(data.resume.email || "");
          setPhoneNumber(data.resume.phone_e164 || "");
          setAddress(data.resume.location_text || "");
          setExperience(data.resume.experience || []);
          setEducation(data.resume.education || []);
          setProjects(data.resume.projects || []);
        }
      } catch (err) {
        console.warn("Could not preload resume:", err.message);
      }
    };

    fetchLatestResume();
  }, []);

  // Simple validation
  const validate = () => {
    if (!fullName.trim()) return "Full name is required";
    if (!email.trim()) return "Email is required";
    if (!company.trim()) return "Company name is required";
    if (!position.trim()) return "Position is required";
    return null;
  };

  // Generate AI cover letter
  const handleGenerateCoverLetter = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setLoading(true);
    setGeneratedLetter("");

    const payload = {
      personal: { fullName, email, phoneNumber, address },
      job: { company, position, manager },
      experience,
      education,
      projects,
    };

    try {
      const token = localStorage.getItem("jwtToken");
      const res = await fetch("/cover-letters/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(
            data.error || "You’ve reached your monthly limit. Upgrade your plan."
          );
        }
        throw new Error(data.error || "Failed to generate cover letter");
      }

      setGeneratedLetter(data.coverLetterText);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Save generated cover letter to DB
  const handleSaveCoverLetter = async () => {
    if (!generatedLetter) {
      setError("Generate the cover letter first before saving.");
      return;
    }

    setError("");
    setLoading(true);

    const payload = {
      personal: { fullName, email, phoneNumber, address },
      job: { company, position, manager },
      experience,
      education,
      projects,
    };

    try {
      const token = localStorage.getItem("jwtToken");
      const res = await fetch("/api/cover-letters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save cover letter");

      alert("Cover letter saved successfully!");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Create Cover Letter</h1>
        <div className="header-actions">
          <button
            className="btn btn-dark"
            onClick={handleGenerateCoverLetter}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Cover Letter"}
          </button>
          <button
            className="btn btn-outline"
            onClick={handleSaveCoverLetter}
            disabled={loading || !generatedLetter}
          >
            Save Cover Letter
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>
      )}

      <div className="form-stack">
        <div className="content-card">
          <h3>Your Information</h3>
          <div className="input-group form-padding">
            <label>Full Name</label>
            <input
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>Email</label>
            <input
              placeholder="john.doe@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
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
            <input
              placeholder="Tech Corp"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
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
            <input
              placeholder="Jane Smith"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
            />
          </div>
        </div>
      </div>

      {generatedLetter && (
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
      )}
    </div>
  );
}
