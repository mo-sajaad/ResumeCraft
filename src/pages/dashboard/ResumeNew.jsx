import { useState } from "react";
import { FaCrown, FaFileAlt, FaEnvelope, FaEdit, FaPlus, FaDownload, FaSave } from 'react-icons/fa'; // Updated icons
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import PhoneInput from 'react-phone-number-input';  // Import PhoneInput
import 'react-phone-number-input/style.css'; // Make sure this CSS file is correctly imported
import './DashboardPages.css';

export default function ResumeNew() {
  const [workExperience, setWorkExperience] = useState([]);  // Store all added work experiences
  const [newExperience, setNewExperience] = useState({
    company: "",
    position: "",
    startDate: null,
    endDate: null,
    description: ""
  });

  const [phoneNumber, setPhoneNumber] = useState(""); // State to manage phone number input

  // Handle input changes for the new work experience
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewExperience((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle date changes for start and end dates
  const handleDateChange = (date, name) => {
    setNewExperience((prev) => ({
      ...prev,
      [name]: date
    }));
  };

  // Add new work experience to the list
  const handleAddExperience = () => {
    if (
      newExperience.company &&
      newExperience.position &&
      newExperience.startDate &&
      newExperience.endDate &&
      newExperience.description
    ) {
      setWorkExperience((prev) => [...prev, newExperience]);  // Add the new experience
      setNewExperience({
        company: "",
        position: "",
        startDate: null,
        endDate: null,
        description: ""
      });  // Reset form after adding
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Edit Resume</h1>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline" type="button" aria-label="AI Suggestions">
            <FaCrown size={20} style={{ marginRight: '8px' }} />AI Suggestions
          </button>
          <button className="btn btn-dark" type="button" aria-label="Save Resume">
            <FaSave size={20} style={{ marginRight: '8px' }} />Save
          </button>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-stack">
          {/* Personal Information Card */}
          <div className="content-card">
            <h3>Personal Information</h3>
            <div className="input-group full-name">
              <label htmlFor="full-name">Full Name</label>
              <input id="full-name" placeholder="John Doe" />
            </div>
            <div className="input-grid">
              <div className="input-group">
                <label htmlFor="email">Email</label>
                <input id="email" placeholder="john.doe@email.com" />
              </div>
              <div className="input-group">
                <label htmlFor="phone">Phone</label>
                <PhoneInput
                  international
                  defaultCountry="US"  // Ensure this is set correctly
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  placeholder="(555) 123-4567"
                  className="input-phone"
                />
              </div>
              <div className="input-group">
                <label htmlFor="location">Location</label>
                <input id="location" placeholder="San Francisco, CA" />
              </div>
              <div className="input-group">
                <label htmlFor="linkedin">LinkedIn</label>
                <input id="linkedin" placeholder="linkedin.com/in/johndoe" />
              </div>
            </div>
          </div>

          {/* Professional Summary Card */}
          <div className="content-card">
            <h3>Professional Summary</h3>
            <div className="input-group">
              <textarea
                placeholder="Experienced software engineer with a passion for building scalable web applications..."
              />
            </div>
          </div>

          {/* Work Experience Card */}
          <div className="content-card">
            <div className="section-title">
              <h3>Work Experience</h3>
              <button className="btn btn-outline" type="button" onClick={handleAddExperience} aria-label="Add Work Experience">
                <FaPlus size={20} style={{ marginRight: '8px' }} />Add Work Experience
              </button>
            </div>

            {/* Work Experience Form Inputs */}
            <div className="input-grid">
              <div className="input-group">
                <label>Company</label>
                <input
                  name="company"
                  value={newExperience.company}
                  onChange={handleInputChange}
                  placeholder="Tech Corp"
                />
              </div>
              <div className="input-group">
                <label>Position</label>
                <input
                  name="position"
                  value={newExperience.position}
                  onChange={handleInputChange}
                  placeholder="Senior Software Engineer"
                />
              </div>
              <div className="input-group">
                <label>Start Date</label>
                <DatePicker
                  selected={newExperience.startDate}
                  onChange={(date) => handleDateChange(date, "startDate")}
                  dateFormat="MMMM yyyy"
                  placeholderText="Select Start Date"
                  className="input-date-picker"
                />
              </div>
              <div className="input-group">
                <label>End Date</label>
                <DatePicker
                  selected={newExperience.endDate}
                  onChange={(date) => handleDateChange(date, "endDate")}
                  dateFormat="MMMM yyyy"
                  placeholderText="Select End Date"
                  className="input-date-picker"
                />
              </div>
            </div>
            <div className="input-group description-input">
              <label>Description</label>
              <textarea
                name="description"
                value={newExperience.description}
                onChange={handleInputChange}
                placeholder="List key achievements and responsibilities."
              />
            </div>

            {/* Display Work Experience List if any added */}
            {workExperience.length > 0 && (
              <div className="work-experience-list">
                <h4>Added Work Experience</h4>
                <ul>
                  {workExperience.map((experience, index) => (
                    <li key={index} className="work-experience-item">
                      <strong>{experience.company}</strong> - {experience.position} <br />
                      <em>{experience.startDate && experience.startDate.toLocaleDateString()} - {experience.endDate && experience.endDate.toLocaleDateString()}</em>
                      <p>{experience.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Education Card */}
          <div className="content-card">
            <h3>Education</h3>
            <div className="input-grid">
              <div className="input-group">
                <label>School</label>
                <input placeholder="University of Technology" />
              </div>
              <div className="input-group">
                <label>Degree</label>
                <input placeholder="Bachelor of Science" />
              </div>
              <div className="input-group">
                <label>Field of Study</label>
                <input placeholder="Computer Science" />
              </div>
              <div className="input-group">
                <label>Graduation Date</label>
                <input placeholder="May 2018" />
              </div>
            </div>
          </div>

          {/* Skills Card */}
          <div className="content-card">
            <h3>Skills</h3>
            <div className="tag-row">
              <span className="tag">JavaScript ✕</span>
              <span className="tag">TypeScript ✕</span>
              <span className="tag">React ✕</span>
              <span className="tag">Node.js ✕</span>
              <span className="tag">Python ✕</span>
              <span className="tag">AWS ✕</span>
              <span className="tag">Docker ✕</span>
              <span className="tag">Git ✕</span>
              <span className="tag add-tag">＋ Add Skill</span>
            </div>
          </div>
        </div>

        {/* Preview Card */}
        <div className="content-card preview-card">
          <div className="section-title">
            <h3>Preview</h3>
            <button className="btn btn-outline" type="button" aria-label="Download Resume">
              <FaDownload size={20} style={{ marginRight: '8px' }} />Download
            </button>
          </div>
          <div className="preview-placeholder">
            <strong>John Doe</strong>
            <p>john.doe@email.com · (555) 123-4567 · San Francisco, CA</p>
            <p>Professional summary and experience preview will appear here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
