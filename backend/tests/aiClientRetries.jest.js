// PLATFORM-007 and PLATFORM-004: createChatCompletion makes 1 + OPENAI_MAX_RETRIES
// attempts itself with SDK retries off, retries its own timeout and connection
// errors, never retries insufficient_quota, and reserves the shared daily cap
// once per completion. The OpenAI SDK and the cap are mocked.
const mockCreate = jest.fn();
const mockOpenAI = jest.fn(() => ({ chat: { completions: { create: mockCreate } } }));
const mockReserve = jest.fn();

jest.mock('openai', () => mockOpenAI);
jest.mock('../middleware/aiAbuseProtection', () => ({
  reserveGlobalAiRequest: (...args) => mockReserve(...args),
}));

const SETTINGS = ['OPENAI_API_KEY', 'OPENAI_MAX_RETRIES', 'OPENAI_RETRY_BASE_DELAY_MS', 'OPENAI_REQUEST_TIMEOUT_MS'];
const MESSAGES = [{ role: 'user', content: 'synthetic prompt' }];
const OK = { choices: [{ message: { content: 'ok' } }] };

function loadClient(settings = {}) {
  let client;
  Object.assign(process.env, { OPENAI_API_KEY: 'test-key', OPENAI_RETRY_BASE_DELAY_MS: '0' }, settings);
  jest.isolateModules(() => { client = require('../services/ai/client'); });
  return client;
}

beforeEach(() => {
  mockCreate.mockReset();
  mockOpenAI.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
  mockReserve.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const name of SETTINGS) delete process.env[name];
});

describe('AI client retries', () => {
  it('constructs the SDK with maxRetries 0 and passes maxRetries 0 and a signal per request', async () => {
    mockCreate.mockResolvedValueOnce(OK);
    const { createChatCompletion } = loadClient();

    await expect(createChatCompletion({ messages: MESSAGES })).resolves.toBe(OK);

    expect(mockOpenAI).toHaveBeenCalledTimes(1);
    expect(mockOpenAI).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
    const [, requestOptions] = mockCreate.mock.calls[0];
    expect(requestOptions).toMatchObject({ maxRetries: 0 });
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['a 500', { status: 500, message: 'server error' }],
    ['a 429 rate limit', { status: 429, code: 'rate_limit_exceeded', message: 'rate limited' }],
    ['an SDK connection error', { name: 'APIConnectionError', message: 'Connection error.' }],
    ['a socket reset in the cause', { message: 'fetch failed', cause: { code: 'ECONNRESET' } }],
  ])('makes 3 attempts in total on %s with the default of 2 retries', async (_label, failure) => {
    mockCreate.mockRejectedValue(failure);
    const { createChatCompletion } = loadClient();

    await expect(createChatCompletion({ messages: MESSAGES })).rejects.toBe(failure);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(mockReserve).toHaveBeenCalledTimes(1);
  });

  it('does not retry insufficient_quota, even though it is a 429', async () => {
    const failure = { status: 429, code: 'insufficient_quota', message: 'You exceeded your current quota' };
    mockCreate.mockRejectedValue(failure);
    const { createChatCompletion } = loadClient();

    await expect(createChatCompletion({ messages: MESSAGES })).rejects.toBe(failure);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-transient error such as a 400', async () => {
    mockCreate.mockRejectedValue({ status: 400, message: 'bad request' });
    const { createChatCompletion } = loadClient();

    await expect(createChatCompletion({ messages: MESSAGES })).rejects.toMatchObject({ status: 400 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('retries when its own request timeout aborts the call (reported as a plain abort)', async () => {
    // The SDK reports our abort as APIUserAbortError "Request was aborted.",
    // which matches none of the retryable patterns on its own.
    mockCreate
      .mockImplementationOnce((_body, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' }));
        });
      }))
      .mockResolvedValueOnce(OK);
    const { createChatCompletion } = loadClient({ OPENAI_REQUEST_TIMEOUT_MS: '20' });

    await expect(createChatCompletion({ messages: MESSAGES })).resolves.toBe(OK);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mockReserve).toHaveBeenCalledTimes(1);
  });

  it('the same plain abort without our timeout is not retried', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' }));
    const { createChatCompletion } = loadClient();

    await expect(createChatCompletion({ messages: MESSAGES })).rejects.toThrow('Request was aborted.');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('OPENAI_MAX_RETRIES=0 makes exactly one attempt', async () => {
    mockCreate.mockRejectedValue({ status: 503, message: 'unavailable' });
    const { createChatCompletion } = loadClient({ OPENAI_MAX_RETRIES: '0' });

    await expect(createChatCompletion({ messages: MESSAGES })).rejects.toMatchObject({ status: 503 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('shared daily cap reservation', () => {
  it('reserves once per completion when retries succeed, before the first OpenAI call', async () => {
    const order = [];
    mockReserve.mockImplementation(async () => { order.push('reserve'); });
    mockCreate
      .mockImplementationOnce(async () => { order.push('create'); throw { status: 502, message: 'bad gateway' }; })
      .mockImplementationOnce(async () => { order.push('create'); return OK; });
    const { createChatCompletion } = loadClient();

    await createChatCompletion({ messages: MESSAGES });
    expect(order).toEqual(['reserve', 'create', 'create']);
  });

  it('does not reserve when there is no API key', async () => {
    const { createChatCompletion } = loadClient({ OPENAI_API_KEY: '' });

    await expect(createChatCompletion({ messages: MESSAGES })).rejects.toMatchObject({ code: 'api_key_missing' });
    expect(mockReserve).not.toHaveBeenCalled();
    expect(mockOpenAI).not.toHaveBeenCalled();
  });

  it('makes no OpenAI call when the cap is reached', async () => {
    const capError = Object.assign(new Error('The shared daily AI usage limit has been reached. Please try again later.'), {
      status: 429,
      code: 'ai_daily_limit_reached',
    });
    mockReserve.mockRejectedValue(capError);
    const { createChatCompletion } = loadClient();

    await expect(createChatCompletion({ messages: MESSAGES })).rejects.toBe(capError);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
