// projectController.js
const { pool } = require('./db');

// Create project
const createProject = async (resumeId, data) => {
  const {
    name,
    project_type,
    description,
    start_label,
    end_label,
    github_url,
    live_url,
    sort_order = 0,
  } = data;

  const result = await pool.query(
    `INSERT INTO projects 
     (resume_id, name, project_type, description, start_label, end_label, github_url, live_url, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [resumeId, name, project_type, description, start_label, end_label, github_url, live_url, sort_order]
  );
  return result.rows[0];
};

// Get projects by resume
const getProjectsByResume = async (resumeId) => {
  const result = await pool.query(
    'SELECT * FROM projects WHERE resume_id = $1 ORDER BY sort_order ASC',
    [resumeId]
  );
  return result.rows;
};

// Update project
const updateProject = async (projectId, data) => {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const key in data) {
    fields.push(`${key} = $${idx}`);
    values.push(data[key]);
    idx++;
  }

  values.push(projectId);

  const result = await pool.query(
    `UPDATE projects SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
};

// Delete project
const deleteProject = async (projectId) => {
  await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
};

module.exports = {
  createProject,
  getProjectsByResume,
  updateProject,
  deleteProject,
};
