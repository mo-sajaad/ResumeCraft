const pool = require('../../../config/db');

async function insertCoverLetter(payload) {
  const result = await pool.query(
    `INSERT INTO cover_letters
      (user_id, title, full_name, email, phone_e164, address_text, company_name, position_title, hiring_manager, opening_paragraph, body_paragraphs, closing_paragraph, generated_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      payload.userId,
      payload.title,
      payload.fullName,
      payload.email,
      payload.phone,
      payload.address,
      payload.company,
      payload.position,
      payload.hiringManager,
      payload.opening,
      payload.body,
      payload.closing,
      payload.generatedText,
    ]
  );
  return result.rows[0] || null;
}

async function findCoverLettersByUser(userId) {
  const result = await pool.query('SELECT * FROM cover_letters WHERE user_id = $1 ORDER BY last_edited_at DESC, created_at DESC', [userId]);
  return result.rows;
}

async function findCoverLetterByIdForUser(id, userId) {
  const result = await pool.query('SELECT * FROM cover_letters WHERE id = $1 AND user_id = $2', [id, userId]);
  return result.rows[0] || null;
}

async function updateCoverLetterByIdForUser(id, userId, data) {
  const result = await pool.query(
    `UPDATE cover_letters
     SET title = COALESCE($1, title),
         full_name = COALESCE($2, full_name),
         email = COALESCE($3, email),
         phone_e164 = COALESCE($4, phone_e164),
         address_text = COALESCE($5, address_text),
         company_name = COALESCE($6, company_name),
         position_title = COALESCE($7, position_title),
         hiring_manager = COALESCE($8, hiring_manager),
         opening_paragraph = COALESCE($9, opening_paragraph),
         body_paragraphs = COALESCE($10, body_paragraphs),
         closing_paragraph = COALESCE($11, closing_paragraph),
         generated_text = COALESCE($12, generated_text),
         updated_at = NOW(),
         last_edited_at = NOW()
     WHERE id = $13 AND user_id = $14
     RETURNING *`,
    [
      data.title,
      data.full_name,
      data.email,
      data.phone_e164,
      data.address_text,
      data.company_name,
      data.position_title,
      data.hiring_manager,
      data.opening_paragraph,
      data.body_paragraphs,
      data.closing_paragraph,
      data.generated_text,
      id,
      userId,
    ]
  );
  return result.rows[0] || null;
}

async function deleteCoverLetterByIdForUser(id, userId) {
  const result = await pool.query('DELETE FROM cover_letters WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return result.rows[0] || null;
}

module.exports = {
  insertCoverLetter,
  findCoverLettersByUser,
  findCoverLetterByIdForUser,
  updateCoverLetterByIdForUser,
  deleteCoverLetterByIdForUser,
};
