const pool = require('../config/db');
const { rewriteDocumentText } = require('../services/aiService');

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
    const type = parseType(req.query.type);
    const id = req.query.id;

    if (!type || !id) {
      return res.status(400).json({ error: 'type and id are required.' });
    }

    if (type === 'resume') {
      const result = await pool.query(
        `SELECT id, title, template_key, summary, generated_text, last_edited_at
         FROM resumes
         WHERE id = $1 AND user_id = $2
         LIMIT 1`,
        [id, req.user.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: 'Resume not found.' });
      }

      const row = result.rows[0];
      return res.json({
        id: row.id,
        type,
        title: row.title,
        style: row.template_key || 'modern',
        text: extractResumeText(row),
        lastEditedAt: row.last_edited_at,
      });
    }

    const result = await pool.query(
      `SELECT id, title, body_paragraphs, generated_text, last_edited_at
       FROM cover_letters
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [id, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Cover letter not found.' });
    }

    const row = result.rows[0];
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
    const type = parseType(req.body?.type);
    const id = req.body?.id;
    const text = typeof req.body?.text === 'string' ? req.body.text : '';

    if (!type || !id) {
      return res.status(400).json({ error: 'type and id are required.' });
    }

    if (type === 'resume') {
      const currentResult = await pool.query(
        'SELECT generated_text FROM resumes WHERE id = $1 AND user_id = $2 LIMIT 1',
        [id, req.user.id]
      );

      if (!currentResult.rows.length) {
        return res.status(404).json({ error: 'Resume not found.' });
      }

      let generated = {};
      try {
        generated = JSON.parse(currentResult.rows[0].generated_text || '{}');
      } catch (_err) {
        generated = {};
      }

      generated.summary = text;

      const result = await pool.query(
        `UPDATE resumes
         SET summary = $1,
             generated_text = $2,
             updated_at = NOW(),
             last_edited_at = NOW()
         WHERE id = $3 AND user_id = $4
         RETURNING id, title, template_key, summary, last_edited_at`,
        [text, JSON.stringify(generated), id, req.user.id]
      );

      return res.json({
        id: result.rows[0].id,
        type,
        title: result.rows[0].title,
        style: result.rows[0].template_key || 'modern',
        text: result.rows[0].summary || '',
        lastEditedAt: result.rows[0].last_edited_at,
      });
    }

    const currentResult = await pool.query(
      'SELECT generated_text FROM cover_letters WHERE id = $1 AND user_id = $2 LIMIT 1',
      [id, req.user.id]
    );

    if (!currentResult.rows.length) {
      return res.status(404).json({ error: 'Cover letter not found.' });
    }

    let generated = {};
    try {
      generated = JSON.parse(currentResult.rows[0].generated_text || '{}');
    } catch (_err) {
      generated = {};
    }

    generated.body = text;

    const result = await pool.query(
      `UPDATE cover_letters
       SET body_paragraphs = $1,
           generated_text = $2,
           updated_at = NOW(),
           last_edited_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING id, title, body_paragraphs, last_edited_at`,
      [text, JSON.stringify(generated), id, req.user.id]
    );

    return res.json({
      id: result.rows[0].id,
      type,
      title: result.rows[0].title,
      style: req.body?.style || 'modern',
      text: result.rows[0].body_paragraphs || '',
      lastEditedAt: result.rows[0].last_edited_at,
    });
  } catch (error) {
    return next(error);
  }
}

async function rewriteWorkspaceDocument(req, res, next) {
  try {
    const type = parseType(req.body?.type);
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';

    if (!type) {
      return res.status(400).json({ error: 'type is required.' });
    }

    if (!text.trim()) {
      return res.status(400).json({ error: 'text is required.' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required.' });
    }

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