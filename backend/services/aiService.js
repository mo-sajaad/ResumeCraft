const OpenAI = require('openai');

let openaiClient = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('AI features are unavailable because OPENAI_API_KEY is not configured.');
    error.status = 503;
    throw error;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return openaiClient;
}

/* ================================
   RESUME BASE PROMPT
================================ */

const resumeBasePrompt = `
You are a professional career writing assistant. Using the information below, generate a clear, concise, and ATS-friendly resume for a Software Engineering role.

Return ONLY JSON in this format:

{
  "summary": "Professional summary paragraph...",
  "skills": ["Skill 1", "Skill 2", "..."],
  "experience": [
    {
      "company": "...",
      "position": "...",
      "start_date": "...",
      "end_date": "...",
      "description": ["Achievement 1", "Achievement 2"]
    }
  ],
  "education": [
    {
      "school": "...",
      "degree": "...",
      "field": "...",
      "graduation_date": "..."
    }
  ],
  "projects": [
    {
      "name": "...",
      "type": "...",
      "description": "...",
      "technologies": ["Tech1", "Tech2"],
      "github": "...",
      "live_demo": "..."
    }
  ]
}

Do not add headings or extra commentary outside this JSON.

---

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

Tone/Style: {tone}  // Modern, Corporate, Creative

Instructions:
- Start with a professional summary (2–3 sentences max) highlighting strengths.
- Use strong action verbs and quantify achievements wherever possible.
- Group skills logically and emphasize relevance to software engineering.
- Use concise bullet points for work experience and projects.
- Keep formatting clean, professional, and ATS-friendly.
- Do not invent experience or skills.
`;

/* ================================
   COVER LETTER BASE PROMPT
================================ */

const coverLetterBasePrompt = `
You are a professional career writing assistant. Using the information below, generate a concise, persuasive, and tailored cover letter for a Software Engineering position.

Return ONLY JSON in this format:

{
  "body": "Paragraph 1...\n\nParagraph 2...\n\nParagraph 3..."
}

Do not add greetings, headers, or extra commentary outside this JSON.

---

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

Tone/Style: {tone}  // Modern, Corporate, Creative

Instructions:
- Start with a strong opening explaining interest in the role and company.
- Highlight technical AND soft skills.
- Prioritize measurable achievements where possible.
- Keep it ATS-friendly and concise (3–5 paragraphs, max one page).
- Avoid repeating the resume word-for-word.
- If information is missing, focus on strengths without hallucinating details.
- Use line breaks (\n\n) to separate paragraphs.
`;

/* ================================
   HELPERS
================================ */

function buildResumePrompt({ personal = {}, skills = [], experience = [], education = [], projects = [], tone }) {
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
    .replace('{projects}', projectsText)
    .replace('{tone}', tone || 'Professional');
}

function buildCoverLetterPrompt({ personal = {}, experience = [], education = [], projects = [], job = {}, tone }) {
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
    .replace('{projects}', projectsText)
    .replace('{tone}', tone || 'Professional');
}

/* ================================
   PARSE AI JSON SAFELY
================================ */

function parseAIJson(aiText) {
  try {
    const jsonStart = aiText.indexOf('{');
    const jsonEnd = aiText.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return {};
    const jsonString = aiText.slice(jsonStart, jsonEnd + 1);
    return JSON.parse(jsonString);
  } catch (err) {
    console.error('Error parsing AI JSON:', err);
    return {};
  }
}

/* ================================
   GENERATE FUNCTIONS
================================ */

async function generateResumeText(data) {
  const prompt = buildResumePrompt(data);
  const openai = getOpenAIClient();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a professional resume writing assistant.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  });

  const text = completion.choices[0].message.content.trim();
  return parseAIJson(text);
}

async function generateCoverLetter(data) {
  const prompt = buildCoverLetterPrompt(data);
  const openai = getOpenAIClient();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a professional cover letter writing assistant.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  });

  const text = completion.choices[0].message.content.trim();
  return parseAIJson(text);
}


async function rewriteDocumentText({ type, currentText, instruction }) {
  const normalizedType = type === 'resume' ? 'resume' : 'cover letter';
  const openai = getOpenAIClient();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a professional career writing assistant. Return only the revised document text with no markdown fences or explanations.',
      },
      {
        role: 'user',
        content: `Document type: ${normalizedType}\n\nCurrent document:\n${currentText}\n\nRevision request: ${instruction}`
      },
    ],
    temperature: 0.4,
  });

  return completion.choices[0].message.content.trim();
}

module.exports = {
  generateResumeText,
  generateCoverLetter,
  rewriteDocumentText
};
