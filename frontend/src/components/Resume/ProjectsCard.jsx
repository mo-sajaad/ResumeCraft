import { useState, useMemo, useRef } from "react";
import { FaPlus } from "react-icons/fa";
import DeleteModal from "./DeleteModal";
import "./ResumePages.css";

export default function ProjectsCard({ projects, setProjects }) {
  const [editingIndex, setEditingIndex] = useState(null);

  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    projectType: "Web App",
    technologies: [],
    startDate: "",
    endDate: "",
    githubUrl: "",
    liveUrl: "",
  });

  const [isAddingTech, setIsAddingTech] = useState(false);
  const [newTech, setNewTech] = useState("");
  const techInputRef = useRef(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);

  const resetForm = () => {
    setNewProject({
      name: "",
      description: "",
      projectType: "Web App",
      technologies: [],
      startDate: "",
      endDate: "",
      githubUrl: "",
      liveUrl: "",
    });
    setEditingIndex(null);
  };

  // Validation for adding/updating project
  const isValid = useMemo(() => {
    if (!newProject.name.trim() || !newProject.description.trim()) return false;
    if (!newProject.startDate.trim()) return false;
    if (!newProject.endDate.trim()) return false;
    return true;
  }, [newProject]);

  const handleAddOrUpdate = () => {
    if (!isValid) return;

    if (editingIndex !== null) {
      const updated = [...projects];
      updated[editingIndex] = newProject;
      setProjects(updated);
    } else {
      setProjects([...projects, newProject]);
    }

    resetForm();
  };

  const handleEdit = (index) => {
    setNewProject(projects[index]);
    setEditingIndex(index);
  };

  const handleDelete = () => {
    const updated = projects.filter((_, index) => index !== projectToDelete);
    setProjects(updated);
    setShowDeleteModal(false);
  };

  const handleAddTech = () => {
    if (newTech && !newProject.technologies.includes(newTech)) {
      setNewProject((prev) => ({
        ...prev,
        technologies: [...prev.technologies, newTech],
      }));
      setNewTech("");
      setIsAddingTech(false);
    }
  };

  const handleRemoveTech = (tech) => {
    setNewProject((prev) => ({
      ...prev,
      technologies: prev.technologies.filter((t) => t !== tech),
    }));
  };

  return (
    <div className="content-card">
      <div className="section-title">
        <h3>Projects</h3>
        <button
          className="btn btn-outline"
          onClick={handleAddOrUpdate}
          disabled={!isValid}
          style={{ opacity: !isValid ? 0.6 : 1 }}
        >
          <FaPlus size={20} style={{ marginRight: "8px" }} />
          {editingIndex !== null ? "Update Project" : "Add Project"}
        </button>
      </div>

      {/* Form Inputs */}
      <div className="input-grid">
        <div className="input-group">
          <label>Project Name</label>
          <input
            value={newProject.name}
            onChange={(e) =>
              setNewProject((prev) => ({ ...prev, name: e.target.value }))
            }
          />
        </div>

        <div className="input-group">
          <label>Project Type</label>
          <select
            value={newProject.projectType}
            onChange={(e) =>
              setNewProject((prev) => ({
                ...prev,
                projectType: e.target.value,
              }))
            }
          >
            <option value="Web App">Web App</option>
            <option value="Mobile App">Mobile App</option>
            <option value="API">API</option>
            <option value="Data / ML">Data / ML</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      <div className="input-group">
        <label>Description</label>
        <textarea
          value={newProject.description}
          onChange={(e) =>
            setNewProject((prev) => ({
              ...prev,
              description: e.target.value,
            }))
          }
        />
      </div>

      <div className="input-group">
        <label>Technologies Used</label>
        <div className="tag-row">
          {newProject.technologies.map((tech, index) => (
            <div key={index} className="tag">
              {tech}
              <span className="remove-tag" onClick={() => handleRemoveTech(tech)}>
                ×
              </span>
            </div>
          ))}
          {isAddingTech ? (
            <input
              className="skill-input tag"
              placeholder="Add tech"
              value={newTech}
              onChange={(e) => setNewTech(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTech()}
              onBlur={() => !newTech && setIsAddingTech(false)}
              ref={techInputRef}
            />
          ) : (
            <button
              className="btn btn-outline tag"
              onClick={() => {
                setIsAddingTech(true);
                techInputRef.current?.focus();
              }}
            >
              + Add Tech
            </button>
          )}
        </div>
      </div>

      <div className="input-grid">
        <div className="input-group">
          <label>Start Date</label>
          <input
            value={newProject.startDate}
            onChange={(e) =>
              setNewProject((prev) => ({ ...prev, startDate: e.target.value }))
            }
            placeholder="e.g., Jan 2023"
          />
        </div>

        <div className="input-group">
          <label>End Date</label>
          <input
            value={newProject.endDate}
            onChange={(e) =>
              setNewProject((prev) => ({ ...prev, endDate: e.target.value }))
            }
            placeholder="e.g., Present"
          />
        </div>
      </div>

      <div className="input-grid">
        <div className="input-group">
          <label>GitHub URL</label>
          <input
            value={newProject.githubUrl}
            onChange={(e) =>
              setNewProject((prev) => ({ ...prev, githubUrl: e.target.value }))
            }
            placeholder="https://github.com/username/project"
          />
        </div>

        <div className="input-group">
          <label>Live Demo URL</label>
          <input
            value={newProject.liveUrl}
            onChange={(e) =>
              setNewProject((prev) => ({ ...prev, liveUrl: e.target.value }))
            }
            placeholder="https://project.vercel.app"
          />
        </div>
      </div>

      {/* Added Projects List */}
      {projects.length > 0 && (
        <div className="project-list">
          <h4>Added Projects</h4>
          <ul className="added-list">
            {projects.map((project, index) => (
              <li key={index}>
                <strong>{project.name}</strong> ({project.projectType})
                <p>{project.description}</p>
                <p>
                  <em>{project.technologies.join(", ")}</em>
                </p>

                <p>
                  <em>
                    {project.startDate} - {project.endDate}
                  </em>
                </p>

                <div className="project-actions">
                  <button
                    className="btn btn-outline"
                    onClick={() => handleEdit(index)}
                  >
                    Edit
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      setProjectToDelete(index);
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

      {/* Delete Modal */}
      <DeleteModal
        open={showDeleteModal}
        title="Delete Project?"
        description={`Are you sure you want to delete "${projects[projectToDelete]?.name}"? This action cannot be undone.`}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
