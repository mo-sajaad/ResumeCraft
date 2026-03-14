const pool = require('../../../config/db');

async function findResumeByIdForUser(id, userId) {
  const result = await pool.query(
    `SELECT id, title, template_key, summary, generated_text, last_edited_at
     FROM resumes
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function findCoverLetterByIdForUser(id, userId) {
  const result = await pool.query(
    `SELECT id, title, body_paragraphs, generated_text, last_edited_at
     FROM cover_letters
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function updateResumeText(id, userId, text, generatedText) {
  const result = await pool.query(
    `UPDATE resumes
     SET summary = $1,
         generated_text = $2,
         updated_at = NOW(),
         last_edited_at = NOW()
     WHERE id = $3 AND user_id = $4
     RETURNING id, title, template_key, summary, generated_text, last_edited_at`,
    [text, generatedText, id, userId]
  );
  return result.rows[0] || null;
}

async function updateCoverLetterText(id, userId, text, generatedText) {
  const result = await pool.query(
    `UPDATE cover_letters
     SET body_paragraphs = $1,
         generated_text = $2,
         updated_at = NOW(),
         last_edited_at = NOW()
     WHERE id = $3 AND user_id = $4
     RETURNING id, title, body_paragraphs, generated_text, last_edited_at`,
    [text, generatedText, id, userId]
  );
  return result.rows[0] || null;
}

module.exports = {
  findResumeByIdForUser,
  findCoverLetterByIdForUser,
  updateResumeText,
  updateCoverLetterText,
};
