import { useRef, useState } from "react";
import "./ResumePages.css";


export default function SkillsCard({
  skills = [],
  setSkills,
}) {
  const skillInputRef = useRef(null);
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [newSkill, setNewSkill] = useState("");

  const handleAddSkill = () => {
    if (newSkill && !skills.includes(newSkill) && skills.length < 10) {
      setSkills((prev) => [...prev, newSkill]);
      setNewSkill("");
      setIsAddingSkill(false);
    }
  };

  return (
    <div className="content-card">
      <h3>Skills</h3>
      <div className="tag-row">
        {skills.map((skill, index) => (
          <div key={index} className="tag">
            {skill}
            <span
              className="remove-tag"
              onClick={() => setSkills((prev) => prev.filter((s) => s !== skill))}
            >
              ×
            </span>
          </div>
        ))}

        {isAddingSkill ? (
          <input
            className="skill-input tag"
            placeholder="Enter new skill"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddSkill();
            }}
            onBlur={() => !newSkill && setIsAddingSkill(false)}
            ref={skillInputRef}
          />
        ) : (
          <button
            className="btn btn-outline add-skill-button tag"
            onClick={() => {
              setIsAddingSkill(true);
              skillInputRef.current?.focus();
            }}
          >
            + Add Skill
          </button>
        )}
      </div>
    </div>
  );
}
