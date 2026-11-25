const { z } = require('../../../shared/http/validators');

const exchangeTokenSchema = z.object({
  firebaseToken: z.string().trim().min(1),
  fullName: z.string().nullish(),
});

module.exports = {
  exchangeTokenSchema,
};
