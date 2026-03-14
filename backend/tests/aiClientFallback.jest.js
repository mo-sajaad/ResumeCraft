describe('AI client fallbacks', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.OPENAI_API_KEY;
  });

  it('throws api_key_missing when OPENAI_API_KEY is absent', async () => {
    const { createChatCompletion } = require('../services/ai/client');

    await expect(createChatCompletion({ messages: [{ role: 'user', content: 'hello' }] }))
      .rejects
      .toMatchObject({ code: 'api_key_missing' });
  });

  it('retries transient errors before succeeding', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const createMock = jest
      .fn()
      .mockRejectedValueOnce({ status: 429, message: 'rate limited' })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] });

    jest.doMock('openai', () => {
      return jest.fn().mockImplementation(() => ({
        chat: { completions: { create: createMock } },
      }));
    });

    const { createChatCompletion } = require('../services/ai/client');

    const result = await createChatCompletion({
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.choices[0].message.content).toBe('ok');
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
