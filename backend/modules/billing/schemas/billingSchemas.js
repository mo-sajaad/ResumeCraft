const { z } = require('../../../shared/http/validators');

const checkoutSchema = z.object({
  plan: z.enum(['premium', 'pro']),
});

module.exports = {
  checkoutSchema,
};
