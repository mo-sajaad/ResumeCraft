import { useState, useMemo } from "react";
import { FaPlus } from "react-icons/fa";
import DeleteModal from "./DeleteModal";
import "./ResumePages.css";

export default function EducationCard({ education, setEducation }) {
  const [editingIndex, setEditingIndex] = useState(null);

  const [newEducation, setNewEducation] = useState({
    school: "",
    educationLevel: "Bachelor's Degree",
    degree: "",
    fieldOfStudy: "",
    highSchoolQualification: "A-Levels",
    grades: "",
    subjects: [{ subject: "", grade: "" }],
    graduationDate: "",
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [educationToDelete, setEducationToDelete] = useState(null);

  const resetForm = () => {
    setNewEducation({
      school: "",
      educationLevel: "Bachelor's Degree",
      degree: "",
      fieldOfStudy: "",
      highSchoolQualification: "A-Levels",
      grades: "",
      subjects: [{ subject: "", grade: "" }],
      graduationDate: "",
    });
    setEditingIndex(null);
  };

  // -------------------------
  // Validation (UNCHANGED)
  // -------------------------
  const isValid = useMemo(() => {
    const { school, educationLevel, degree, fieldOfStudy, graduationDate } =
      newEducation;

    if (!school.trim()) return false;
    if (!educationLevel) return false;

    if (educationLevel !== "High School") {
      if (!degree.trim() || !fieldOfStudy.trim()) return false;
    }

    if (!graduationDate.trim()) return false;

    return true;
  }, [newEducation]);

  // -------------------------
  // Add / Update (UPDATED TO USE PARENT STATE)
  // -------------------------
  const handleAddOrUpdate = () => {
    if (!isValid) return;

    if (editingIndex !== null) {
      const updated = [...education];
      updated[editingIndex] = newEducation;
      setEducation(updated);
    } else {
      setEducation([...education, newEducation]);
    }

    resetForm();
  };

  // -------------------------
  // Subjects Logic (UNCHANGED)
  // -------------------------
  const handleSubjectChange = (index, e) => {
    const { name, value } = e.target;
    const updatedSubjects = [...newEducation.subjects];
    updatedSubjects[index][name] = value;

    setNewEducation((prev) => ({
      ...prev,
      subjects: updatedSubjects,
    }));
  };

  const handleAddSubject = () => {
    setNewEducation((prev) => ({
      ...prev,
      subjects: [...prev.subjects, { subject: "", grade: "" }],
    }));
  };

  const handleDelete = () => {
    const updated = education.filter((_, i) => i !== educationToDelete);
    setEducation(updated);
    setShowDeleteModal(false);
  };

  return (
    <div className="content-card">
      <div className="section-title">
        <h3>Education</h3>

        <button
          className="btn btn-outline"
          onClick={handleAddOrUpdate}
          disabled={!isValid}
          style={{ opacity: !isValid ? 0.6 : 1 }}
        >
          <FaPlus size={20} style={{ marginRight: "8px" }} />
          {editingIndex !== null ? "Update Education" : "Add Education"}
        </button>
      </div>

      <div className="input-grid">
        <div className="input-group">
          <label>School</label>
          <input
            name="school"
            value={newEducation.school}
            onChange={(e) =>
              setNewEducation((prev) => ({ ...prev, school: e.target.value }))
            }
            placeholder="University of Technology"
          />
        </div>

        <div className="input-group">
          <label>Education Level</label>
          <select
            name="educationLevel"
            value={newEducation.educationLevel}
            onChange={(e) =>
              setNewEducation((prev) => ({
                ...prev,
                educationLevel: e.target.value,
              }))
            }
          >
            <option value="High School">High School</option>
            <option value="Bachelor's Degree">Bachelor's Degree</option>
            <option value="Master's Degree">Master's Degree</option>
            <option value="PhD">PhD</option>
          </select>
        </div>

        {newEducation.educationLevel !== "High School" && (
          <>
            <div className="input-group">
              <label>Degree</label>
              <input
                name="degree"
                value={newEducation.degree}
                onChange={(e) =>
                  setNewEducation((prev) => ({
                    ...prev,
                    degree: e.target.value,
                  }))
                }
                placeholder="Bachelor of Science"
              />
            </div>

            <div className="input-group">
              <label>Field of Study</label>
              <input
                name="fieldOfStudy"
                value={newEducation.fieldOfStudy}
                onChange={(e) =>
                  setNewEducation((prev) => ({
                    ...prev,
                    fieldOfStudy: e.target.value,
                  }))
                }
                placeholder="Computer Science"
              />
            </div>
          </>
        )}

        {newEducation.educationLevel === "High School" && (
          <div className="input-group">
            <label>High School Qualification</label>
            <select
              name="highSchoolQualification"
              value={newEducation.highSchoolQualification}
              onChange={(e) =>
                setNewEducation((prev) => ({
                  ...prev,
                  highSchoolQualification: e.target.value,
                }))
              }
            >
              <option value="A-Levels">A-Levels</option>
              <option value="GCSE">GCSE</option>
              <option value="Other">Other</option>
            </select>
          </div>
        )}

        <div className="input-group">
          <label>Grades (optional)</label>
          <input
            name="grades"
            value={newEducation.grades}
            onChange={(e) =>
              setNewEducation((prev) => ({ ...prev, grades: e.target.value }))
            }
            placeholder="Enter grades (if applicable)"
          />
        </div>

        <div className="input-group">
          <label>Graduation Date</label>
          <input
            name="graduationDate"
            value={newEducation.graduationDate}
            onChange={(e) =>
              setNewEducation((prev) => ({
                ...prev,
                graduationDate: e.target.value,
              }))
            }
            placeholder="e.g., May 2024"
          />
        </div>
      </div>

      {/* High School Subjects */}
      {newEducation.educationLevel === "High School" && (
        <div>
          <h4>Subjects</h4>

          {newEducation.subjects.map((subject, index) => (
            <div key={index} className="input-grid">
              <div className="input-group">
                <label>Subject</label>
                <input
                  name="subject"
                  value={subject.subject}
                  onChange={(e) => handleSubjectChange(index, e)}
                  placeholder="Subject Name"
                />
              </div>

              <div className="input-group">
                <label>Grade</label>
                <input
                  name="grade"
                  value={subject.grade}
                  onChange={(e) => handleSubjectChange(index, e)}
                  placeholder="Grade"
                />
              </div>
            </div>
          ))}

          <button className="btn btn-outline" onClick={handleAddSubject}>
            + Add Subject
          </button>
        </div>
      )}

      {/* Added Education List */}
      {education.length > 0 && (
        <div className="education-list">
          <h4>Added Education</h4>
          <ul className="added-list">
            {education.map((edu, index) => (
              <li key={index}>
                <strong>{edu.school}</strong> -{" "}
                {edu.degree || "High School"}
                <p>
                  <em>{edu.educationLevel}</em>
                </p>
                <p>
                  <em>{edu.graduationDate}</em>
                </p>
                <p>{edu.fieldOfStudy}</p>

                <div className="project-actions">
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setNewEducation(edu);
                      setEditingIndex(index);
                    }}
                  >
                    Edit
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      setEducationToDelete(index);
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
        title="Delete Education?"
        description={`Are you sure you want to delete "${education[educationToDelete]?.school}"? This action cannot be undone.`}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
