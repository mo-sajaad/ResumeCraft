const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

/**
 * Renders a resume or cover letter JSON into HTML using a selected template
 */
function renderTemplateJSON(type, data, style = 'Modern') {
  // Basic templates for demo purposes
  // You can expand to fully styled HTML for each style
  const commonHeader = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: auto; padding: 30px;">
  `;

  const commonFooter = `</div>`;

  if (type === 'resume') {
    const { summary, skills, experience, education, projects } = data;
    const skillsHTML = skills.map(s => `<li>${s}</li>`).join('');
    const experienceHTML = experience
      .map(
        e => `<li>
          <strong>${e.position}</strong> @ ${e.company} (${e.start_date} - ${e.end_date})<br/>
          <ul>${e.description.map(d => `<li>${d}</li>`).join('')}</ul>
        </li>`
      )
      .join('');
    const educationHTML = education
      .map(
        e => `<li>${e.degree} in ${e.field} @ ${e.school} (${e.graduation_date})</li>`
      )
      .join('');
    const projectsHTML = projects
      .map(
        p => `<li>${p.name} (${p.type})<br/>Technologies: ${p.technologies.join(', ')}<br/>${p.description}</li>`
      )
      .join('');

    return `
      ${commonHeader}
      <h1 style="text-align:center;">${data.fullName || 'Resume'}</h1>
      <p><strong>Summary:</strong> ${summary}</p>
      <h2>Skills</h2>
      <ul>${skillsHTML}</ul>
      <h2>Experience</h2>
      <ul>${experienceHTML}</ul>
      <h2>Education</h2>
      <ul>${educationHTML}</ul>
      <h2>Projects</h2>
      <ul>${projectsHTML}</ul>
      ${commonFooter}
    `;
  }

  if (type === 'coverLetter') {
    const body = data.body || '';
    return `
      ${commonHeader}
      <h1 style="text-align:center;">Cover Letter</h1>
      <p>${body.replace(/\n\n/g, '</p><p>')}</p>
      ${commonFooter}
    `;
  }

  throw new Error('Unsupported type for PDF rendering');
}

/**
 * Generate PDF from AI JSON + template style
 * @param {String} type - 'resume' | 'coverLetter'
 * @param {Object} data - structured JSON from AI
 * @param {String} style - template style: 'Modern' | 'Corporate' | 'Creative'
 * @param {String} outputPath - full path to save PDF
 */
async function generatePDF(type, data, style = 'Modern', outputPath) {
  const htmlContent = renderTemplateJSON(type, data, style);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
  });

  await browser.close();
  return outputPath;
}

module.exports = { generatePDF };
