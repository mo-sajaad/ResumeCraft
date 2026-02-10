import { useState } from "react";
import { FaCrown, FaSave, FaPlus } from "react-icons/fa"; // Updated icons
import PhoneInput from "react-phone-number-input"; // Import PhoneInput
import "react-phone-number-input/style.css"; // Ensure this CSS file is correctly imported
import "./DashboardPages.css";
export default function CoverLetterNew() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(""); // State to manage phone number input
  const [address, setAddress] = useState("");
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [manager, setManager] = useState("");
  const [oParagraph, setOParagraph] = useState("");
  const [bParagraphs, setBParagraphs] = useState("");
  const [cParagraph, setCParagraph] = useState("");

  const formInput = {
    FullName: fullName,
    Email: email,
    PhoneNumber: phoneNumber,
    Address: address,
    Company: company,
    Position: position,
    Manager: manager,
    OParagraph: oParagraph,
    BParagraphs: bParagraphs,
    CParagraph: cParagraph,
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Edit Cover Letter</h1>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-outline"
            type="button"
            aria-label="AI Suggestions"
          >
            <FaCrown size={20} style={{ marginRight: "8px" }} />
            Generate Cover Letter
          </button>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-stack">
          <div className="content-card">
            <h3>Your Information</h3>
            <div className="input-group form-padding">
              <label htmlFor="full-name">Full Name</label>
              <input
                id="full-name"
                placeholder="John Doe"
                onChange={setFullName}
              />
            </div>
            <div className="input-grid">
              <div className="input-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  placeholder="john.doe@email.com"
                  onChange={setEmail}
                />
              </div>
              <div className="input-group form-padding">
                <label htmlFor="phone">Phone</label>
                <PhoneInput
                  international
                  defaultCountry="US" // Ensure this is set correctly
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  placeholder="(555) 123-4567"
                  className="input-phone"
                />
              </div>
            </div>
            <div className="input-group">
              <label htmlFor="address">Address</label>
              <input
                id="address"
                placeholder="123 Main St, San Francisco, CA 94102"
                onChange={setAddress}
              />
            </div>
          </div>

          <div className="content-card">
            <h3>Job Details</h3>
            <div className="input-group form-padding">
              <label htmlFor="company-name">Company Name</label>
              <input
                id="company-name"
                placeholder="Tech Corp"
                onChange={setCompany}
              />
            </div>
            <div className="input-group">
              <label htmlFor="position">Position</label>
              <input
                id="position"
                placeholder="Senior Software Engineer"
                onChange={setPosition}
                className="form-padding"
              />
            </div>
            <div className="input-group">
              <label htmlFor="manager">Hiring Manager (Optional)</label>
              <input
                id="manager"
                placeholder="Jane Smith"
                onChange={setManager}
                className="form-padding"
              />
            </div>
          </div>

          <div className="content-card">
            <div className="section-title">
              <h3>Letter Content</h3>
              <button
                className="btn btn-outline"
                type="button"
                aria-label="AI Suggestions"
              >
                <FaCrown size={20} style={{ marginRight: "8px" }} />
                Generate with AI
              </button>
            </div>
            <div className="input-group form-padding">
              <label>Opening Paragraph</label>
              <textarea
                placeholder="Introduce yourself and state the position you're applying for."
                onChange={setOParagraph}
              />
            </div>
            <div className="input-group form-padding">
              <label>Body Paragraphs</label>
              <textarea
                placeholder="Highlight your qualifications and achievements."
                onChange={setBParagraphs}
              />
            </div>
            <div className="input-group form-padding">
              <label>Closing Paragraph</label>
              <textarea
                placeholder="Thank the reader and express enthusiasm for next steps."
                onChange={setCParagraph}
              />
            </div>
          </div>
        </div>

        <div className="content-card preview-card">
          <div className="section-title">
            <h3>Preview</h3>
            <button className="btn btn-outline" type="button">
              ⬇ Download
            </button>
          </div>
          <div className="preview-placeholder">
            <p>John Doe</p>
            <p>123 Main St, San Francisco, CA 94102</p>
            <p>john.doe@email.com · (555) 123-4567</p>
            <p>Dear Jane Smith,</p>
            <p>Cover letter preview will appear here as you type.</p>
            <p>{formInput.cParagraph}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
