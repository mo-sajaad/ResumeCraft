// aiController.js
const OpenAI = require('openai');

// Initialize OpenAI client with your API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Base prompt template
const basePrompt = `
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

/**
 * Generates an AI-powered resume text using OpenAI
 * @param {Object} param0
 * @param {Object} param0.personal - Personal info (fullName, email, phoneNumber, location, linkedin)
 * @param {Array} param0.skills - Array of skills
 * @param {Array} param0.experience - Array of work experience objects
 * @param {Array} param0.education - Array of education objects
 * @param {Array} param0.projects - Array of projects
 * @returns {string} Generated resume text
 */
async function generateResumeText({ personal, skills, experience, education, projects }) {
  // Convert arrays to strings
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

  // Replace placeholders in basePrompt
  const prompt = basePrompt
    .replace('{fullName}', personal.fullName)
    .replace('{email}', personal.email)
    .replace('{phone}', personal.phoneNumber || '')
    .replace('{location}', personal.location || '')
    .replace('{linkedin}', personal.linkedin || '')
    .replace('{skills}', skillsText)
    .replace('{experience}', experienceText)
    .replace('{education}', educationText)
    .replace('{projects}', projectsText);

  // Call OpenAI Chat Completion API
  const completion = await openai.chat.completions.create({
    model: 'gpt-4', // or 'gpt-3.5-turbo' if you want a cheaper/faster model
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7, // creative but controlled
  });

  // Extract AI-generated resume text
  const generatedText = completion.choices[0].message.content;

  return generatedText;
}

module.exports = {
  generateResumeText,
};
