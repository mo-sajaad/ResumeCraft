const { z } = require('../../../shared/http/validators');

const typeSchema = z.enum(['resume', 'cover-letter', 'cover_letter', 'coverletter']);

const workspaceReadSchema = z.object({
  type: typeSchema,
  id: z.string().trim().min(1),
  style: z.string().optional(),
});

const workspaceUpdateSchema = z.object({
  type: typeSchema,
  id: z.string().trim().min(1),
  text: z.string(),
  style: z.string().optional(),
});

const workspaceRewriteSchema = z.object({
  type: typeSchema,
  text: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
});

module.exports = {
  workspaceReadSchema,
  workspaceUpdateSchema,
  workspaceRewriteSchema,
};
