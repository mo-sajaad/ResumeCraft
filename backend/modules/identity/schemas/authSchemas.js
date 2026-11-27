const { z } = require('../../../shared/http/validators');

const exchangeTokenSchema = z.object({
  firebaseToken: z.string().trim().min(1),
  fullName: z.string().max(200).nullish(),
});

module.exports = {
  exchangeTokenSchema,
};
