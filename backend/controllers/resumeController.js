// controllers/resumeController.js
const pool = require('../config/db');
const { generateResumeText } = require('../services/aiService');
const { findOrCreateUser } = require('../services/userService');
const { trackUsage } = require('../services/subscriptionService');

async function createResumeWithAI(req, res, next) {
  try {
    const { personal, skills, experience, education, projects } = req.body;

    const user = await findOrCreateUser(
      req.user.userId,
      req.user.email
    );

    // 1️⃣ Generate AI Resume
    const generatedText = await generateResumeText({
      personal,
      skills,
      experience,
      education,
      projects,
    });

    // 2️⃣ Insert Resume
    const resumeResult = await pool.query(
      `INSERT INTO resumes 
       (user_id, title, full_name, email, phone_e164, location_text, linkedin_url, generated_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        user.id,
        `${personal.fullName}'s Resume`,
        personal.fullName,
        personal.email,
        personal.phoneNumber || null,
        personal.location || null,
        personal.linkedin || null,
        generatedText,
      ]
    );

    const resume = resumeResult.rows[0];

    // 3️⃣ Log AI generation (your analytics table)
    await pool.query(
      `INSERT INTO ai_generations
       (user_id, document_type, document_id, model_name, status, output_text)
       VALUES ($1,'resume',$2,'gpt-4','succeeded',$3)`,
      [user.id, resume.id, generatedText]
    );

    // 4️⃣ Track subscription usage (IMPORTANT)
    await trackUsage(user.id, 'resume');

    res.json({
      resumeId: resume.id,
      resumeText: generatedText,
    });

  } catch (err) {
    console.error('Error in createResumeWithAI:', err);
    next(err);
  }
}

async function getResumesByUser(req, res, next) {
  try {
    const user = await findOrCreateUser(
      req.user.userId,
      req.user.email
    );

    const result = await pool.query(
      'SELECT * FROM resumes WHERE user_id = $1 ORDER BY created_at DESC',
      [user.id]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function getResumeById(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT * FROM resumes WHERE id = $1',
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function updateResume(req, res, next) {
  try {
    const { title } = req.body;

    const result = await pool.query(
      'UPDATE resumes SET title = $1 WHERE id = $2 RETURNING *',
      [title, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteResume(req, res, next) {
  try {
    await pool.query(
      'DELETE FROM resumes WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Resume deleted' });
  } catch (err) {
    next(err);
  }
}


module.exports = {
  createResumeWithAI,
  getResumesByUser,
  getResumeById,
  updateResume,
  deleteResume,
};
