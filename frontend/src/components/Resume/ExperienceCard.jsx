import { useState, useMemo } from "react";
import { FaPlus } from "react-icons/fa";

import useListManager from "../../hooks/useListManager";
import DeleteModal from "./DeleteModal";

import "./ResumePages.css";

export default function ExperienceCard() {
  const { items, addOrUpdate, remove, edit, editingIndex } =
    useListManager([]);

  const [newExperience, setNewExperience] = useState({
    company: "",
    position: "",
    startDate: "",
    endDate: "",
    description: "",
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [experienceToDelete, setExperienceToDelete] = useState(null);

  const resetForm = () => {
    setNewExperience({
      company: "",
      position: "",
      startDate: "",
      endDate: "",
      description: "",
    });
  };

  // -------------------------
  // Validation
  // -------------------------
  const isValid = useMemo(() => {
    const { company, position, startDate, endDate } = newExperience;

    if (!company.trim() || !position.trim()) return false;
    if (!startDate.trim() || !endDate.trim()) return false;

    return true;
  }, [newExperience]);

  // -------------------------
  // Add / Update
  // -------------------------
  const handleAddOrUpdate = () => {
    if (!isValid) return;
    addOrUpdate(newExperience);
    resetForm();
  };

  return (
    <div className="content-card">
      <div className="section-title">
        <h3>Work Experience</h3>

        <button
          className="btn btn-outline"
          onClick={handleAddOrUpdate}
          disabled={!isValid}
          style={{ opacity: !isValid ? 0.6 : 1 }}
        >
          <FaPlus size={20} style={{ marginRight: "8px" }} />
          {editingIndex !== null ? "Update Experience" : "Add Work Experience"}
        </button>
      </div>

      {/* Form Inputs */}
      <div className="input-grid">
        <div className="input-group">
          <label>Company</label>
          <input
            name="company"
            value={newExperience.company}
            onChange={(e) =>
              setNewExperience((prev) => ({ ...prev, company: e.target.value }))
            }
            placeholder="Tech Corp"
          />
        </div>

        <div className="input-group">
          <label>Position</label>
          <input
            name="position"
            value={newExperience.position}
            onChange={(e) =>
              setNewExperience((prev) => ({ ...prev, position: e.target.value }))
            }
            placeholder="Senior Software Engineer"
          />
        </div>

        <div className="input-group">
          <label>Start Date</label>
          <input
            name="startDate"
            value={newExperience.startDate}
            onChange={(e) =>
              setNewExperience((prev) => ({ ...prev, startDate: e.target.value }))
            }
            placeholder="e.g., Jan 2022"
          />
        </div>

        <div className="input-group">
          <label>End Date</label>
          <input
            name="endDate"
            value={newExperience.endDate}
            onChange={(e) =>
              setNewExperience((prev) => ({ ...prev, endDate: e.target.value }))
            }
            placeholder="e.g., Present"
          />
        </div>
      </div>

      <div className="input-group description-input">
        <label>Description</label>
        <textarea
          value={newExperience.description}
          onChange={(e) =>
            setNewExperience((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="List key achievements and responsibilities."
        />
      </div>

      {/* List */}
      {items.length > 0 && (
        <div className="work-experience-list">
          <h4>Added Work Experience</h4>
          <ul className="added-list">
            {items.map((exp, idx) => (
              <li key={idx}>
                <strong>{exp.company}</strong> - {exp.position}
                <p>
                  <em>
                    {exp.startDate} - {exp.endDate}
                  </em>
                </p>
                <p>{exp.description}</p>

                <div className="project-actions">
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      const item = edit(idx);
                      setNewExperience(item);
                    }}
                  >
                    Edit
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      setExperienceToDelete(idx);
                      setShowDeleteModal(true);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DeleteModal
        open={showDeleteModal}
        title="Delete Experience?"
        description={`Are you sure you want to delete "${items[experienceToDelete]?.company}"? This action cannot be undone.`}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={() => {
          remove(experienceToDelete);
          setShowDeleteModal(false);
        }}
      />
    </div>
  );
}
