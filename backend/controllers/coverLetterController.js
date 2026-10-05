const { generateCoverLetter } = require('../services/aiService');
const { trackUsage } = require('../services/subscriptionService');
const coverLetterService = require('../modules/documents/services/coverLetterService');
const { generatePDF, renderHTML } = require('../templates/utils/pdfGenerator');
const { validate } = require('../shared/http/validators');
const { createCoverLetterSchema, updateCoverLetterSchema } = require('../modules/documents/schemas/coverLetterSchemas');

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
    const { personal, experience, education, projects, job, style } = validate(createCoverLetterSchema, req.body || {});


    const generatedData = await generateCoverLetter({
      personal,
      experience,
      education,
      projects,
      job,
      tone: style,
    });

    const body = parseCoverLetterBody(generatedData);

    const createdCoverLetter = await coverLetterService.createCoverLetter({
      userId,
      title: `${job.position} - ${job.company}`,
      fullName: personal.fullName || null,
      email: personal.email || null,
      phone: personal.phoneNumber || null,
      address: personal.address || personal.location || null,
      company: job.company,
      position: job.position,
      hiringManager: job.manager || null,
      opening: null,
      body: body || null,
      closing: null,
      generatedText: JSON.stringify({ body }),
    });

    await trackUsage(userId, 'cover_letter');

    return res.status(201).json({
      coverLetterId: createdCoverLetter.id,
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
    const coverLetters = await coverLetterService.listUserCoverLetters(req.user.id);

    return res.json(coverLetters);
  } catch (error) {
    return next(error);
  }
}

async function getCoverLetterById(req, res, next) {
  try {
    const coverLetter = await coverLetterService.getUserCoverLetter(req.params.id, req.user.id);

    if (!coverLetter) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }

    return res.json(coverLetter);
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
    } = validate(updateCoverLetterSchema, req.body || {});

    const safeGenerated =
      generated_text === undefined
        ? null
        : typeof generated_text === 'string'
          ? generated_text
          : JSON.stringify(generated_text);

    const updatedCoverLetter = await coverLetterService.updateUserCoverLetter(req.params.id, req.user.id, {
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
      generated_text: safeGenerated,
    });

    if (!updatedCoverLetter) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }

    return res.json(updatedCoverLetter);
  } catch (error) {
    return next(error);
  }
}

async function deleteCoverLetter(req, res, next) {
  try {
    const deleted = await coverLetterService.deleteUserCoverLetter(req.params.id, req.user.id);

    if (!deleted) {
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

    const row = await coverLetterService.getUserCoverLetter(req.params.id, req.user.id);

    if (!row) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }
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

    const row = await coverLetterService.getUserCoverLetter(req.params.id, req.user.id);

    if (!row) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }
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
