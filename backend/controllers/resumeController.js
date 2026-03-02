const pool = require("../config/db");
const { generatePDF, renderHTML } = require("../services/pdfGenerator");

/* ===============================
   PREVIEW (HTML)
=================================*/

async function previewResume(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const allowedStyles = ["modern", "corporate", "creative"];
    const style = allowedStyles.includes(req.query.style)
      ? req.query.style
      : "modern";

    const result = await pool.query(
      "SELECT * FROM resumes WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Resume not found" });
    }

    const resume = result.rows[0];
    const data = JSON.parse(resume.generated_text);

    const personal = {
      fullName: resume.full_name,
      email: resume.email,
      phoneNumber: resume.phone_e164,
      location: resume.location_text,
      linkedin: resume.linkedin_url
    };

    const html = renderHTML(style, "resume", data, personal);

    res.setHeader("Content-Type", "text/html");
    res.send(html);

  } catch (err) {
    next(err);
  }
}

/* ===============================
   DOWNLOAD PDF
=================================*/

async function downloadResume(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const allowedStyles = ["modern", "corporate", "creative"];
    const style = allowedStyles.includes(req.query.style)
      ? req.query.style
      : "modern";

    const result = await pool.query(
      "SELECT * FROM resumes WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Resume not found" });
    }

    // Optional: Premium check
    // if (!req.user.isPremium) {
    //   return res.status(403).json({ error: "Upgrade to download PDF" });
    // }

    const resume = result.rows[0];
    const data = JSON.parse(resume.generated_text);

    const personal = {
      fullName: resume.full_name,
      email: resume.email,
      phoneNumber: resume.phone_e164,
      location: resume.location_text,
      linkedin: resume.linkedin_url
    };

    const pdfBuffer = await generatePDF(style, "resume", data, personal);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=resume-${id}.pdf`
    );

    res.send(pdfBuffer);

  } catch (err) {
    next(err);
  }
}

module.exports = {
  previewResume,
  downloadResume
};