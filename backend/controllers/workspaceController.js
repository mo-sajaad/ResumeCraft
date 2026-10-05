const { rewriteDocumentText } = require('../services/aiService');
const workspaceService = require('../modules/documents/services/workspaceService');
const { validate } = require('../shared/http/validators');
const { workspaceReadSchema, workspaceUpdateSchema, workspaceRewriteSchema } = require('../modules/documents/schemas/workspaceSchemas');

function parseType(rawType) {
  const type = String(rawType || '').toLowerCase();
  if (type === 'resume') return 'resume';
  if (type === 'cover-letter' || type === 'cover_letter' || type === 'coverletter') {
    return 'cover-letter';
  }
  return null;
}

function extractResumeText(row) {
  if (row.summary) return row.summary;

  if (row.generated_text) {
    try {
      const parsed = JSON.parse(row.generated_text);
      if (typeof parsed?.summary === 'string') return parsed.summary;
    } catch (_err) {
      return row.generated_text;
    }
  }

  return '';
}

function extractCoverLetterText(row) {
  if (row.body_paragraphs) return row.body_paragraphs;

  if (row.generated_text) {
    try {
      const parsed = JSON.parse(row.generated_text);
      if (typeof parsed?.body === 'string') return parsed.body;
    } catch (_err) {
      return row.generated_text;
    }
  }

  return '';
}

async function getWorkspaceDocument(req, res, next) {
  try {
    const query = validate(workspaceReadSchema, req.query || {});
    const type = parseType(query.type);
    const id = query.id;

    const row = type === 'resume'
      ? await workspaceService.getResumeForUser(id, req.user.id)
      : await workspaceService.getCoverLetterForUser(id, req.user.id);

    if (!row) {
      return res.status(404).json({ error: type === 'resume' ? 'Resume not found.' : 'Cover letter not found.' });
    }

    if (type === 'resume') {
      return res.json({
        id: row.id,
        type,
        title: row.title,
        style: row.template_key || 'modern',
        text: extractResumeText(row),
        lastEditedAt: row.last_edited_at,
      });
    }

    return res.json({
      id: row.id,
      type,
      title: row.title,
      style: req.query.style || 'modern',
      text: extractCoverLetterText(row),
      lastEditedAt: row.last_edited_at,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateWorkspaceDocument(req, res, next) {
  try {
    const payload = validate(workspaceUpdateSchema, req.body || {});
    const type = parseType(payload.type);
    const id = payload.id;
    const text = payload.text;

    const current = type === 'resume'
      ? await workspaceService.getResumeForUser(id, req.user.id)
      : await workspaceService.getCoverLetterForUser(id, req.user.id);

    if (!current) {
      return res.status(404).json({ error: type === 'resume' ? 'Resume not found.' : 'Cover letter not found.' });
    }

    let generated = {};
    try {
      generated = JSON.parse(current.generated_text || '{}');
    } catch (_err) {
      generated = {};
    }

    if (type === 'resume') {
      generated.summary = text;
    } else {
      generated.body = text;
    }

    const updated = type === 'resume'
      ? await workspaceService.updateResumeForUser(id, req.user.id, text, JSON.stringify(generated))
      : await workspaceService.updateCoverLetterForUser(id, req.user.id, text, JSON.stringify(generated));

    if (!updated) {
      return res.status(404).json({ error: type === 'resume' ? 'Resume not found.' : 'Cover letter not found.' });
    }

    return res.json({
      id: updated.id,
      type,
      title: updated.title,
      style: type === 'resume' ? (updated.template_key || 'modern') : (req.body?.style || 'modern'),
      text,
      lastEditedAt: updated.last_edited_at,
    });
  } catch (error) {
    return next(error);
  }
}

async function rewriteWorkspaceDocument(req, res, next) {
  try {
    const payload = validate(workspaceRewriteSchema, req.body || {});
    const type = parseType(payload.type);
    const text = payload.text;
    const prompt = payload.prompt;

    const rewrittenText = await rewriteDocumentText({
      type,
      currentText: text,
      instruction: prompt,
    });

    return res.json({ rewrittenText });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getWorkspaceDocument,
  updateWorkspaceDocument,
  rewriteWorkspaceDocument,
};
