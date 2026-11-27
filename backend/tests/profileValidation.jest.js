// IDENTITY-020: fullName on the exchange is limited to 200 characters.
const { exchangeTokenSchema } = require('../modules/identity/schemas/authSchemas');

describe('IDENTITY-020: fullName length', () => {
  it('accepts 200 characters', () => {
    expect(exchangeTokenSchema.safeParse({ firebaseToken: 't', fullName: 'a'.repeat(200) }).success).toBe(true);
  });

  it('rejects 201 characters', () => {
    const result = exchangeTokenSchema.safeParse({ firebaseToken: 't', fullName: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['fullName']);
  });
});
