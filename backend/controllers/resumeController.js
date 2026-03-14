const { generateResumeText } = require('../services/aiService');
const { trackUsage } = require('../services/subscriptionService');
const { services: { resumeService } } = require('../modules/documents');
const { generatePDF, renderHTML } = require('../templates/utils/pdfGenerator');
const { validate } = require('../shared/http/validators');
const { createResumeSchema, updateResumeSchema } = require('../modules/documents/schemas/resumeSchemas');

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
    const { personal, skills, experience, education, projects, style, title } = validate(createResumeSchema, req.body || {});

    const generatedData = sanitizeGeneratedResume(
      await generateResumeText({ personal, skills, experience, education, projects, tone: style })
    );

    const createdResume = await resumeService.createResume({
      userId,
      title: title || `${personal.fullName} Resume`,
      fullName: personal.fullName,
      email: personal.email,
      phoneNumber: personal.phoneNumber || null,
      location: personal.location || null,
      linkedin: personal.linkedin || null,
      templateKey: style,
      summary: generatedData.summary || null,
      generatedText: JSON.stringify(generatedData),
    });

    await trackUsage(userId, 'resume');

    return res.status(201).json({
      resumeId: createdResume.id,
      resumeData: generatedData,
    });
  } catch (error) {
    return next(error);
  }
}

async function getResumesByUser(req, res, next) {
  try {
    const resumes = await resumeService.listUserResumes(req.user.id);

    return res.json(resumes);
  } catch (error) {
    return next(error);
  }
}

async function getResumeById(req, res, next) {
  try {
    const resume = await resumeService.getUserResume(req.params.id, req.user.id);

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    return res.json(resume);
  } catch (error) {
    return next(error);
  }
}

async function updateResume(req, res, next) {
  try {
    const { title, full_name, email, phone_e164, location_text, linkedin_url, summary, generated_text, template_key } =
      validate(updateResumeSchema, req.body || {});

    const updatedResume = await resumeService.updateUserResume(req.params.id, req.user.id, {
      title,
      full_name,
      email,
      phone_e164,
      location_text,
      linkedin_url,
      summary,
      generated_text: generated_text ? JSON.stringify(generated_text) : null,
      template_key,
    });

    if (!updatedResume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    return res.json(updatedResume);
  } catch (error) {
    return next(error);
  }
}

async function deleteResume(req, res, next) {
  try {
    const deleted = await resumeService.deleteUserResume(req.params.id, req.user.id);

    if (!deleted) {
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

    const resume = await resumeService.getUserResume(id, userId);

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }
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

    const resume = await resumeService.getUserResume(id, userId);

    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    // Optional: Premium check
    // if (!req.user.isPremium) {
    //   return res.status(403).json({ error: "Upgrade to download PDF" });
    // }

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