const pool = require('../config/db');
const { generateCoverLetter } = require('../services/aiService');
const { trackUsage } = require('../services/subscriptionService');
const { generatePDF, renderHTML } = require('../templates/utils/pdfGenerator');

function parseCoverLetterBody(generatedData = {}) {
  return typeof generatedData.body === 'string' ? generatedData.body : '';
}

function toCoverLetterTextFromRow(row) {
  if (row.generated_text) {
    try {
      const parsed = JSON.parse(row.generated_text);
      return parseCoverLetterBody(parsed);
    } catch (_error) {
      return row.generated_text;
    }
  }

  const paragraphs = [row.opening_paragraph, row.body_paragraphs, row.closing_paragraph]
    .filter(Boolean)
    .join('\n\n');

  return paragraphs;
}


function toCoverLetterTemplateData(row) {
  return {
    body: toCoverLetterTextFromRow(row),
    date: new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    recipientName: row.hiring_manager || 'Hiring Manager',
    companyName: row.company_name || '',
    companyAddress: '',
    jobTitle: row.position_title || '',
  };
}

async function createCoverLetterWithAI(req, res, next) {
  const userId = req.user.id;

  try {
    const { personal = {}, experience = [], education = [], projects = [], job = {}, style = 'modern' } = req.body || {};

    if (!job.company || !job.position) {
      return res.status(400).json({ error: 'Job company and position are required.' });
    }


    const generatedData = await generateCoverLetter({
      personal,
      experience,
      education,
      projects,
      job,
      tone: style,
    });

    const body = parseCoverLetterBody(generatedData);

    const result = await pool.query(
      `INSERT INTO cover_letters
      (user_id, title, full_name, email, phone_e164, address_text, company_name, position_title, hiring_manager, body_paragraphs, generated_text)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        userId,
        `${job.position} - ${job.company}`,
        personal.fullName || null,
        personal.email || null,
        personal.phoneNumber || null,
        personal.address || personal.location || null,
        job.company,
        job.position,
        job.manager || null,
        body || null,
        JSON.stringify({ body }),
      ]
    );


    await trackUsage(userId, 'cover_letter');

    return res.status(201).json({
      coverLetterId: result.rows[0].id,
      coverLetterText: body,
      coverLetterData: { body },
    });
  } catch (error) {
    console.error('Error creating AI cover letter for user:', userId, error);
    return next(error);
  }
}

async function getCoverLettersByUser(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT * FROM cover_letters WHERE user_id = $1 ORDER BY last_edited_at DESC, created_at DESC',
      [req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
}

async function getCoverLetterById(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM cover_letters WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
}

async function updateCoverLetter(req, res, next) {
  try {
    const {
      title,
      full_name,
      email,
      phone_e164,
      address_text,
      company_name,
      position_title,
      hiring_manager,
      opening_paragraph,
      body_paragraphs,
      closing_paragraph,
      generated_text,
    } = req.body || {};

    const safeGenerated =
      generated_text === undefined
        ? null
        : typeof generated_text === 'string'
          ? generated_text
          : JSON.stringify(generated_text);

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
        title,
        full_name,
        email,
        phone_e164,
        address_text,
        company_name,
        position_title,
        hiring_manager,
        opening_paragraph,
        body_paragraphs,
        closing_paragraph,
        safeGenerated,
        req.params.id,
        req.user.id,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
}

async function deleteCoverLetter(req, res, next) {
  try {
    const result = await pool.query('DELETE FROM cover_letters WHERE id = $1 AND user_id = $2 RETURNING id', [
      req.params.id,
      req.user.id,
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function previewCoverLetter(req, res, next) {
  try {
    const allowedStyles = ['modern', 'corporate', 'creative'];
    const style = allowedStyles.includes(req.query.style) ? req.query.style : 'modern';

    const result = await pool.query('SELECT * FROM cover_letters WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }

    const row = result.rows[0];
    const templateData = toCoverLetterTemplateData(row);
    const html = renderHTML(style, 'cover-letter', templateData, {
      fullName: row.full_name,
      email: row.email,
      phoneNumber: row.phone_e164,
      location: row.address_text,
      linkedin: '',
    });

    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  } catch (error) {
    return next(error);
  }
}

async function downloadCoverLetter(req, res, next) {
  try {
    const allowedStyles = ['modern', 'corporate', 'creative'];
    const style = allowedStyles.includes(req.query.style) ? req.query.style : 'modern';

    const result = await pool.query('SELECT * FROM cover_letters WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }

    const row = result.rows[0];
    const templateData = toCoverLetterTemplateData(row);

    const pdfBuffer = await generatePDF(style, 'cover-letter', templateData, {
      fullName: row.full_name,
      email: row.email,
      phoneNumber: row.phone_e164,
      location: row.address_text,
      linkedin: '',
    });

  res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cover-letter-${row.id}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createCoverLetterWithAI,
  getCoverLettersByUser,
  getCoverLetterById,
  updateCoverLetter,
  deleteCoverLetter,
  previewCoverLetter,
  downloadCoverLetter,
};
