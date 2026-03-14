const pool = require('../../../config/db');

async function insertResume(payload) {
  const result = await pool.query(
    `INSERT INTO resumes
    (user_id, title, full_name, email, phone_e164, location_text, linkedin_url, template_key, summary, generated_text)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      payload.userId,
      payload.title,
      payload.fullName,
      payload.email,
      payload.phoneNumber,
      payload.location,
      payload.linkedin,
      payload.templateKey,
      payload.summary,
      payload.generatedText,
    ]
  );
  return result.rows[0] || null;
}

async function findResumesByUser(userId) {
  const result = await pool.query('SELECT * FROM resumes WHERE user_id = $1 ORDER BY last_edited_at DESC, created_at DESC', [userId]);
  return result.rows;
}

async function findResumeByIdForUser(id, userId) {
  const result = await pool.query('SELECT * FROM resumes WHERE id = $1 AND user_id = $2', [id, userId]);
  return result.rows[0] || null;
}

async function updateResumeByIdForUser(id, userId, data) {
  const result = await pool.query(
    `UPDATE resumes
     SET title = COALESCE($1, title),
         full_name = COALESCE($2, full_name),
         email = COALESCE($3, email),
         phone_e164 = COALESCE($4, phone_e164),
         location_text = COALESCE($5, location_text),
         linkedin_url = COALESCE($6, linkedin_url),
         summary = COALESCE($7, summary),
         generated_text = COALESCE($8, generated_text),
         template_key = COALESCE($9, template_key),
         updated_at = NOW(),
         last_edited_at = NOW()
     WHERE id = $10 AND user_id = $11
     RETURNING *`,
    [
      data.title,
      data.full_name,
      data.email,
      data.phone_e164,
      data.location_text,
      data.linkedin_url,
      data.summary,
      data.generated_text,
      data.template_key,
      id,
      userId,
    ]
  );
  return result.rows[0] || null;
}

async function deleteResumeByIdForUser(id, userId) {
  const result = await pool.query('DELETE FROM resumes WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return result.rows[0] || null;
}

module.exports = {
  insertResume,
  findResumesByUser,
  findResumeByIdForUser,
  updateResumeByIdForUser,
  deleteResumeByIdForUser,
};
