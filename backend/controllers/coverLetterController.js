const pool = require('../config/db');
const { generateCoverLetter } = require('../services/aiService');
const { trackUsage } = require('../services/subscriptionService');

/**
 * Creates a cover letter using AI and saves it to the database
 */
async function createCoverLetterWithAI(req, res, next) {
  try {
    const { personal, experience, education, projects, job } = req.body;

    if (!job || !job.company || !job.position) {
      return res.status(400).json({ error: 'Job information is required' });
    }

    const userId = req.user.userId;

    // 1️⃣ Generate AI text
    const generatedText = await generateCoverLetter({
      personal,
      experience,
      education,
      projects,
      job,
    });

    // 2️⃣ Save to DB
    const result = await pool.query(
      `INSERT INTO cover_letters 
        (user_id, resume_id, company_name, position_name, job_description, generated_text)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
      [
        userId,
        job.resumeId || null,
        job.company,
        job.position,
        job.jobDescription || '',
        generatedText,
      ]
    );

    // 3️⃣ Track usage AFTER successful save
    await trackUsage(userId, 'cover_letter');

    res.json({
      coverLetterId: result.rows[0].id,
      coverLetterText: generatedText,
    });

  } catch (err) {
    console.error('Error in createCoverLetterWithAI:', err);
    next(err);
  }
}

module.exports = { createCoverLetterWithAI };
