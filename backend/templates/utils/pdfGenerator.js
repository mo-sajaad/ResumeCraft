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
  return items.map(item => `<li>${item}</li>`).join("");
}

function buildExperienceSection(experience = []) {
  return experience.map(job => `
    <div class="job">
      <div class="job-title">${job.position} — ${job.company}</div>
      <div class="job-meta">${job.start_date || ""} – ${job.end_date || ""}</div>
      <ul>
        ${buildList(job.description || [])}
      </ul>
    </div>
  `).join("");
}

function buildEducationSection(education = []) {
  return education.map(edu => `
    <div class="job">
      <div class="job-title">
        ${edu.degree || ""} ${edu.field ? `in ${edu.field}` : ""}
      </div>
      <div class="job-meta">
        ${edu.school || ""} — ${edu.graduation_date || ""}
      </div>
    </div>
  `).join("");
}

function buildProjectsSection(projects = []) {
  return projects.map(project => `
    <div class="job">
      <div class="job-title">${project.name}</div>
      <div class="job-meta">${project.type || ""}</div>
      <div>${project.description || ""}</div>
      ${project.technologies?.length
        ? `<div><strong>Technologies:</strong> ${project.technologies.join(", ")}</div>`
        : ""}
      ${project.github ? `<div>GitHub: ${project.github}</div>` : ""}
      ${project.live_demo ? `<div>Live: ${project.live_demo}</div>` : ""}
    </div>
  `).join("");
}

function buildParagraphs(text = "") {
  return text
    .split("\n\n")
    .map(p => `<p>${p}</p>`)
    .join("");
}

function populateTemplate(html, data, personal = {}) {
  return html
    .replace(/{{full_name}}/g, personal.fullName || "")
    .replace(/{{email}}/g, personal.email || "")
    .replace(/{{phone}}/g, personal.phoneNumber || "")
    .replace(/{{location}}/g, personal.location || "")
    .replace(/{{linkedin}}/g, personal.linkedin || "")
    .replace(/{{summary}}/g, data.summary || "")
    .replace(/{{skills_list}}/g, buildList(data.skills))
    .replace(/{{experience_section}}/g, buildExperienceSection(data.experience))
    .replace(/{{education_section}}/g, buildEducationSection(data.education))
    .replace(/{{projects_section}}/g, buildProjectsSection(data.projects))
    .replace(/{{body_paragraphs}}/g, buildParagraphs(data.body));
}

/* ===============================
   HTML RENDER (Used for Preview + PDF)
=================================*/

function renderHTML(style, type, data, personal) {
  const templateDir = path.join(
    __dirname,
    "..",
    "templates",
    style.toLowerCase(),
    type.toLowerCase()
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
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
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
      right: "15mm"
    }
  });

  await browser.close();

  return pdfBuffer;
}

module.exports = {
  generatePDF,
  renderHTML
};