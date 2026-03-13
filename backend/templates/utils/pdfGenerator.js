const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

/* ===============================
   HELPERS
=================================*/

function injectCSS(html, css) {
  return html.replace("</head>", `<style>${css}</style></head>`);
}

function buildList(items = []) {
  return items.map((item) => `<li>${item}</li>`).join("");
}

function buildExperienceSection(experience = []) {
  return experience
    .map(
      (job) => `
    <div class="job">
      <div class="job-title">${job.position} — ${job.company}</div>
      <div class="job-meta">${job.start_date || ""} – ${job.end_date || ""}</div>
      <ul>
        ${buildList(job.description || [])}
      </ul>
    </div>
  `,
    )
    .join("");
}

function buildEducationSection(education = []) {
  return education
    .map(
      (edu) => `
    <div class="job">
      <div class="job-title">
        ${edu.degree || ""} ${edu.field ? `in ${edu.field}` : ""}
      </div>
      <div class="job-meta">
        ${edu.school || ""} — ${edu.graduation_date || ""}
      </div>
    </div>
  `,
    )
    .join("");
}

function buildProjectsSection(projects = []) {
  return projects
    .map(
      (project) => `
    <div class="job">
      <div class="job-title">${project.name}</div>
      <div class="job-meta">${project.type || ""}</div>
      <div>${project.description || ""}</div>
      ${
        project.technologies?.length
          ? `<div><strong>Technologies:</strong> ${project.technologies.join(", ")}</div>`
          : ""
      }
      ${project.github ? `<div>GitHub: ${project.github}</div>` : ""}
      ${project.live_demo ? `<div>Live: ${project.live_demo}</div>` : ""}
    </div>
  `,
    )
    .join("");
}

function buildParagraphs(text = "") {
  return String(text)
    .split("\n\n")
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function formatDisplayDate(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function populateTemplate(html, data = {}, personal = {}) {
  const replacements = {
    full_name: personal.fullName || "",
    email: personal.email || "",
    phone: personal.phoneNumber || "",
    location: personal.location || "",
    linkedin: personal.linkedin || "",
    summary: data.summary || "",
    skills_list: buildList(data.skills || []),
    experience_section: buildExperienceSection(data.experience || []),
    education_section: buildEducationSection(data.education || []),
    projects_section: buildProjectsSection(data.projects || []),
    body_paragraphs: buildParagraphs(data.body || data.body_paragraphs || ""),
    date: data.date || formatDisplayDate(),
    recipient_name: data.recipientName || data.recipient_name || "Hiring Manager",
    company_name: data.companyName || data.company_name || "",
    company_address: data.companyAddress || data.company_address || "",
    job_title: data.jobTitle || data.job_title || "",
  };

  let populatedHtml = html;
  Object.entries(replacements).forEach(([key, value]) => {
    populatedHtml = populatedHtml.replace(
      new RegExp(`{{${key}}}`, "g"),
      value == null ? "" : String(value)
    );
  });

  // Prevent raw placeholders from leaking into generated previews/PDFs.
  return populatedHtml.replace(/{{[a-zA-Z0-9_]+}}/g, "");
}

function normalizeTemplateType(type = "") {
  const normalized = String(type).toLowerCase();

  if (normalized === "coverletter" || normalized === "cover_letter") {
    return "cover-letter";
  }

  return normalized;
}

/* ===============================
   HTML RENDER (Used for Preview + PDF)
=================================*/

function renderHTML(style, type, data, personal) {
  const templateDir = path.join(
    __dirname,
    "..",
    style.toLowerCase(),
    normalizeTemplateType(type),
  );

  const htmlPath = path.join(templateDir, "template.html");
  const cssPath = path.join(templateDir, "styles.css");

  if (!fs.existsSync(htmlPath) || !fs.existsSync(cssPath)) {
    throw new Error(`Template not found: ${style}/${type}`);
  }

  let html = fs.readFileSync(htmlPath, "utf8");
  const css = fs.readFileSync(cssPath, "utf8");

  html = injectCSS(html, css);
  html = populateTemplate(html, data, personal);

  return html;
}

/* ===============================
   PDF GENERATION
=================================*/

async function generatePDF(style, type, data, personal) {
  const html = renderHTML(style, type, data, personal);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "20mm",
      bottom: "20mm",
      left: "15mm",
      right: "15mm",
    },
  });

  await browser.close();

  return pdfBuffer;
}

module.exports = {
  generatePDF,
  renderHTML,
};
