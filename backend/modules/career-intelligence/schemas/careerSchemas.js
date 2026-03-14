const { z } = require('../../../shared/http/validators');

const freeTextPayloadSchema = z.object({
  resumeText: z.string().optional(),
  jobDescription: z.string().optional(),
  targetRole: z.string().optional(),
  answerText: z.string().optional(),
}).passthrough();

module.exports = {
  freeTextPayloadSchema,
};
