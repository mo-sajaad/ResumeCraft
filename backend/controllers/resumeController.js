const pool = require('../config/db');
const { generateResumeText } = require('../services/aiService');
const { trackUsage } = require('../services/subscriptionService');
const { generatePDF, renderHTML } = require('../templates/utils/pdfGenerator');

function sanitizeGeneratedResume(payload = {}) {
  return {
    summary: payload.summary || '',
    skills: Array.isArray(payload.skills) ? payload.skills : [],
    experience: Array.isArray(payload.experience) ? payload.experience : [],
    education: Array.isArray(payload.education) ? payload.education : [],
    projects: Array.isArray(payload.projects) ? payload.projects : [],
  };
}

async function createResumeWithAI(req, res, next) {
  const userId = req.user.id;


  try {
    const {
      personal = {},
      skills = [],
      experience = [],
      education = [],
      projects = [],
      style = 'modern',
      title,
    } = req.body || {};

    if (!personal.fullName || !personal.email) {
      return res.status(400).json({ error: 'Full name and email are required.' });
    }

    const generatedData = sanitizeGeneratedResume(
      await generateResumeText({ personal, skills, experience, education, projects, tone: style })
    );

    const result = await pool.query(
      `INSERT INTO resumes
      (user_id, title, full_name, email, phone_e164, location_text, linkedin_url, template_key, summary, generated_text)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        userId,
        title || `${personal.fullName} Resume`,
        personal.fullName,
        personal.email,
        personal.phoneNumber || null,
        personal.location || null,
        personal.linkedin || null,
        style,
        generatedData.summary || null,
        JSON.stringify(generatedData),
      ]
    );

    await trackUsage(userId, 'resume');

    return res.status(201).json({
      resumeId: result.rows[0].id,
      resumeData: generatedData,
    });
  } catch (error) {
    return next(error);
  }
}

async function getResumesByUser(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT * FROM resumes WHERE user_id = $1 ORDER BY last_edited_at DESC, created_at DESC`,
      [req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
}

async function getResumeById(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM resumes WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
}

async function updateResume(req, res, next) {
  try {
    const { title, full_name, email, phone_e164, location_text, linkedin_url, summary, generated_text, template_key } =
      req.body || {};

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
        title,
        full_name,
        email,
        phone_e164,
        location_text,
        linkedin_url,
        summary,
        generated_text ? JSON.stringify(generated_text) : null,
        template_key,
        req.params.id,
        req.user.id,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
}

async function deleteResume(req, res, next) {
  try {
    const result = await pool.query('DELETE FROM resumes WHERE id = $1 AND user_id = $2 RETURNING id', [
      req.params.id,
      req.user.id,
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function previewResume(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const allowedStyles = ['modern', 'corporate', 'creative'];
    const style = allowedStyles.includes(req.query.style) ? req.query.style : 'modern';

    const result = await pool.query('SELECT * FROM resumes WHERE id = $1 AND user_id = $2', [id, userId]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const resume = result.rows[0];
    const data = sanitizeGeneratedResume(JSON.parse(resume.generated_text || '{}'));

    const personal = {
      fullName: resume.full_name,
      email: resume.email,
      phoneNumber: resume.phone_e164,
      location: resume.location_text,
      linkedin: resume.linkedin_url,
    };

    const html = renderHTML(style, 'resume', data, personal);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  } catch (error) {
    return next(error);
  }
}



async function downloadResume(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const allowedStyles = ['modern', 'corporate', 'creative'];
    const style = allowedStyles.includes(req.query.style) ? req.query.style : 'modern';

    const result = await pool.query('SELECT * FROM resumes WHERE id = $1 AND user_id = $2', [id, userId]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Resume not found" });
    }

    // Optional: Premium check
    // if (!req.user.isPremium) {
    //   return res.status(403).json({ error: "Upgrade to download PDF" });
    // }

    const resume = result.rows[0];
    const data = sanitizeGeneratedResume(JSON.parse(resume.generated_text || '{}'));

    const personal = {
      fullName: resume.full_name,
      email: resume.email,
      phoneNumber: resume.phone_e164,
      location: resume.location_text,
      linkedin: resume.linkedin_url,
    };

    const pdfBuffer = await generatePDF(style, 'resume', data, personal);

  res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=resume-${id}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createResumeWithAI,
  getResumesByUser,
  getResumeById,
  updateResume,
  deleteResume,
  previewResume,
  downloadResume,
};