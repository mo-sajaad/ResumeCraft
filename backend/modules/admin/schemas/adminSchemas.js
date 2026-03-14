const { z } = require('../../../shared/http/validators');

const updateFeatureFlagSchema = z.object({
  description: z.string().optional(),
  enabled: z.boolean(),
  rolloutPercent: z.number().min(0).max(100).optional(),
});

const adminAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

const adminAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

module.exports = {
  updateFeatureFlagSchema,
  adminAnalyticsQuerySchema,
  adminAuditQuerySchema,
};
