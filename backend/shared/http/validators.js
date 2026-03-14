const { z } = require('zod');

function validate(schema, value, { statusCode = 400 } = {}) {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  const message = parsed.error.issues?.map((issue) => issue.message).join('; ') || 'Validation failed.';
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = parsed.error.issues;
  throw error;
}

function optionalString() {
  return z.string().trim().min(1).optional();
}

module.exports = {
  z,
  validate,
  optionalString,
};
