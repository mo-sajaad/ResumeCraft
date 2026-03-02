const pool = require('../config/db');
const { generateCoverLetter } = require('../services/aiService');
const { trackUsage } = require('../services/subscriptionService');

async function createCoverLetterWithAI(req, res, next) {
  const userId = req.user.id;

  try {
    const { personal, experience, education, projects, job, style } = req.body;

    if (!job || !job.company || !job.position) {
      return res.status(400).json({ error: 'Job information is required' });
    }

    // 1️⃣ Generate AI Cover Letter JSON
    const generatedData = await generateCoverLetter({
      personal,
      experience,
      education,
      projects,
      job,
      tone: style || 'Professional',
    });

    // 2️⃣ Save to DB
    const result = await pool.query(
      `INSERT INTO cover_letters 
        (user_id, resume_id, company_name, position_title, job_description, generated_text)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
      [
        userId,
        job.resumeId || null,
        job.company,
        job.position,
        job.jobDescription || '',
        JSON.stringify(generatedData),
      ]
    );

    // 3️⃣ Track usage
    await trackUsage(userId, 'cover_letter');

    res.json({
      coverLetterId: result.rows[0].id,
      coverLetterData: generatedData,
    });

  } catch (err) {
    console.error('Error creating AI cover letter for user:', userId, err);
    next(err);
  }
}

module.exports = { createCoverLetterWithAI };
