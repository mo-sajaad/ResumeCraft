import { useState } from "react";
import PersonalInfoCard from "../../components/Resume/PersonalInfoCard";
import SkillsCard from "../../components/Resume/SkillsCard";
import ExperienceCard from "../../components/Resume/ExperienceCard";
import EducationCard from "../../components/Resume/EducationCard";
import ProjectsCard from "../../components/Resume/ProjectsCard";

import { FaCrown, FaSave } from "react-icons/fa";

export default function ResumeNew() {
  // PERSONAL INFO
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");

  // SKILLS
  const [skills, setSkills] = useState([
    "JavaScript",
    "React",
    "Node.js",
    "HTML",
    "CSS",
  ]);

  // EXPERIENCE
  const [workExperience, setWorkExperience] = useState([]);

  // EDUCATION
  const [education, setEducation] = useState([]);

  // PROJECTS
  const [projects, setProjects] = useState([]);

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validate = () => {
    if (!fullName.trim()) return "Full name is required";
    if (!email.trim()) return "Email is required";
    if (skills.length === 0) return "Add at least one skill";

    if (
      workExperience.length === 0 &&
      education.length === 0 &&
      projects.length === 0
    ) {
      return "Add at least one experience, education or project";
    }

    return null;
  };

  const handleGenerateResume = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setLoading(true);

    const payload = {
      personal: { fullName, email, phoneNumber, location, linkedin },
      skills,
      experience: workExperience,
      education,
      projects,
    };

    try {
      const res = await fetch("/api/generate-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate resume");
      }

      // Replace with your logic (download, show preview, etc.)
      alert("Resume generated! (check console)");
      console.log(data.resumeText);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Edit Resume</h1>
        <div className="header-actions">
          <button className="btn btn-outline">
            <FaCrown /> AI Suggestions
          </button>
          <button className="btn btn-dark" onClick={handleGenerateResume}>
            Generate Resume
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>
      )}

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

        <ExperienceCard
          workExperience={workExperience}
          setWorkExperience={setWorkExperience}
        />

        <EducationCard
          education={education}
          setEducation={setEducation}
        />

        <ProjectsCard
          projects={projects}
          setProjects={setProjects}
        />
      </div>

      {loading && <div style={{ marginTop: "1rem" }}>Generating...</div>}
    </div>
  );
}
