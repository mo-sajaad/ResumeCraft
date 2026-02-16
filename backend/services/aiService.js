// services/aiService.js
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ================================
   RESUME BASE PROMPT
================================ */

const resumeBasePrompt = `
You are an expert resume writer. Using the information provided below, generate a professional, well-formatted, and ATS-friendly resume. Use clear sections, bullet points, and concise language. Highlight achievements, skills, and relevant experiences. Tailor the resume to be suitable for software engineering roles. Avoid redundancy and make it easy to read. 

Personal Information:
Name: {fullName}
Email: {email}
Phone: {phone}
Location: {location}
LinkedIn: {linkedin}

Skills:
{skills}

Work Experience:
{experience}

Education:
{education}

Projects:
{projects}

Instructions:
- Start with a professional summary or objective.
- Use action verbs and quantify achievements where possible.
- Group skills logically.
- Highlight technical and soft skills.
- Make it suitable for an applicant tracking system (ATS).
- Keep formatting clean and readable.

Output the resume in text format, ready to copy into Word, PDF, or LinkedIn.
`;

/* ================================
   HELPER: BUILD RESUME PROMPT
================================ */

function buildResumePrompt({ personal, skills, experience, education, projects }) {
  const skillsText = skills.join(', ');

  const experienceText = experience
    .map(
      (e) =>
        `Company: ${e.company}, Position: ${e.position}, From: ${e.start}, To: ${e.end}, Description: ${e.description || ''}`
    )
    .join('\n');

  const educationText = education
    .map(
      (e) =>
        `School: ${e.school}, Level: ${e.level}, Degree: ${e.degree || ''}, Field: ${e.fieldOfStudy || ''}, Graduation: ${e.graduation || ''}`
    )
    .join('\n');

  const projectsText = projects
    .map(
      (p) =>
        `Name: ${p.name}, Type: ${p.type}, Description: ${p.description || ''}, Start: ${p.start}, End: ${p.end}, GitHub: ${p.github || ''}, Live: ${p.live || ''}`
    )
    .join('\n');

  return resumeBasePrompt
    .replace('{fullName}', personal.fullName)
    .replace('{email}', personal.email)
    .replace('{phone}', personal.phoneNumber || '')
    .replace('{location}', personal.location || '')
    .replace('{linkedin}', personal.linkedin || '')
    .replace('{skills}', skillsText)
    .replace('{experience}', experienceText)
    .replace('{education}', educationText)
    .replace('{projects}', projectsText);
}

/* ================================
   GENERATE RESUME TEXT
================================ */

async function generateResumeText(data) {
  const prompt = buildResumePrompt(data);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4', // or gpt-3.5-turbo
    messages: [
      {
        role: 'system',
        content: 'You are a professional resume writing assistant.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
  });

  return completion.choices[0].message.content.trim();
}

/* ================================
   COVER LETTER BASE PROMPT
================================ */

const coverLetterBasePrompt = `
You are an expert cover letter writer. Using the information provided below, generate a professional, well-structured, and persuasive cover letter. 
Make it personalized, concise, and tailored to a software engineering role. Highlight relevant skills, experiences, and achievements. Avoid redundancy and keep it easy to read.

Personal Information:
Name: {fullName}
Email: {email}
Phone: {phone}
Location: {location}
LinkedIn: {linkedin}

Job Information:
Company: {company}
Position: {position}
Job Description: {jobDescription}

Experience:
{experience}

Education:
{education}

Projects:
{projects}

Instructions:
- Start with a strong opening paragraph explaining why the applicant is interested.
- Highlight technical and soft skills in the body.
- Tailor the letter to the position and company.
- Conclude with a confident closing statement.
- Keep it professional and ATS-friendly.

Output the cover letter in text format, ready to copy into Word, PDF, or email.
`;


function buildCoverLetterPrompt({ personal, experience, education, projects, job }) {
  const experienceText = experience
    .map(
      (e) =>
        `Company: ${e.company}, Position: ${e.position}, From: ${e.start}, To: ${e.end}, Description: ${e.description || ''}`
    )
    .join('\n');

  const educationText = education
    .map(
      (e) =>
        `School: ${e.school}, Level: ${e.level}, Degree: ${e.degree || ''}, Field: ${e.fieldOfStudy || ''}, Graduation: ${e.graduation || ''}`
    )
    .join('\n');

  const projectsText = projects
    .map(
      (p) =>
        `Name: ${p.name}, Type: ${p.type}, Description: ${p.description || ''}, Start: ${p.start}, End: ${p.end}`
    )
    .join('\n');

  return coverLetterBasePrompt
    .replace('{fullName}', personal.fullName)
    .replace('{email}', personal.email)
    .replace('{phone}', personal.phoneNumber || '')
    .replace('{location}', personal.location || '')
    .replace('{linkedin}', personal.linkedin || '')
    .replace('{company}', job.company || '')
    .replace('{position}', job.position || '')
    .replace('{jobDescription}', job.jobDescription || '')
    .replace('{experience}', experienceText)
    .replace('{education}', educationText)
    .replace('{projects}', projectsText);
}

async function generateCoverLetter({ personal, experience, education, projects, job }) {
  const prompt = buildCoverLetterPrompt({ personal, experience, education, projects, job });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a professional cover letter writing assistant.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  });

  return completion.choices[0].message.content.trim();
}

module.exports = {
  generateResumeText,
  generateCoverLetter,
};
