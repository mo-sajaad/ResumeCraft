const { z } = require('../../../shared/http/validators');

const resumePersonalSchema = z.object({
  fullName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phoneNumber: z.string().trim().optional(),
  location: z.string().trim().optional(),
  linkedin: z.string().trim().optional(),
});

const createResumeSchema = z.object({
  personal: resumePersonalSchema,
  skills: z.array(z.any()).optional().default([]),
  experience: z.array(z.any()).optional().default([]),
  education: z.array(z.any()).optional().default([]),
  projects: z.array(z.any()).optional().default([]),
  style: z.string().trim().optional().default('modern'),
  title: z.string().trim().optional(),
});

const updateResumeSchema = z.object({
  title: z.string().optional(),
  full_name: z.string().optional(),
  email: z.string().optional(),
  phone_e164: z.string().optional(),
  location_text: z.string().optional(),
  linkedin_url: z.string().optional(),
  summary: z.string().optional(),
  generated_text: z.any().optional(),
  template_key: z.string().optional(),
});

module.exports = {
  createResumeSchema,
  updateResumeSchema,
};
