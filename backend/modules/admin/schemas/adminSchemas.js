const { z } = require('../../../shared/http/validators');

// Lower-case words joined by underscores, like the seeded flags (ADMIN-011).
const featureFlagKeySchema = z.string().regex(
  /^[a-z][a-z0-9_]{0,63}$/,
  'Flag key must be 1-64 lower-case letters, digits or underscores, starting with a letter.'
);

const updateFeatureFlagSchema = z.object({
  // Omitted keeps the stored text; null or an empty string clears it.
  description: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
});

const adminAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

const adminAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

module.exports = {
  featureFlagKeySchema,
  updateFeatureFlagSchema,
  adminAnalyticsQuerySchema,
  adminAuditQuerySchema,
};
