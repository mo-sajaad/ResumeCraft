const { z } = require('../../../shared/http/validators');

const createCoverLetterSchema = z.object({
  personal: z.object({
    fullName: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    address: z.string().optional(),
    location: z.string().optional(),
  }).optional().default({}),
  experience: z.array(z.any()).optional().default([]),
  education: z.array(z.any()).optional().default([]),
  projects: z.array(z.any()).optional().default([]),
  job: z.object({
    company: z.string().trim().min(1),
    position: z.string().trim().min(1),
    manager: z.string().optional(),
  }),
  style: z.string().optional().default('modern'),
});

const updateCoverLetterSchema = z.object({
  title: z.string().optional(),
  full_name: z.string().optional(),
  email: z.string().optional(),
  phone_e164: z.string().optional(),
  address_text: z.string().optional(),
  company_name: z.string().optional(),
  position_title: z.string().optional(),
  hiring_manager: z.string().optional(),
  opening_paragraph: z.string().optional(),
  body_paragraphs: z.string().optional(),
  closing_paragraph: z.string().optional(),
  generated_text: z.union([z.string(), z.record(z.any())]).optional(),
});

module.exports = {
  createCoverLetterSchema,
  updateCoverLetterSchema,
};
