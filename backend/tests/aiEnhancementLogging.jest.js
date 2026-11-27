// CAREER-022: what Career Lab logs when OpenAI fails or answers badly. The
// OpenAI client and the logger are fakes; the response fields are covered in
// aiEnhancement.test.js.
const mockCreateChatCompletion = jest.fn();

jest.mock('../services/ai/client', () => ({
  getOpenAIClient: () => ({}),
  createChatCompletion: (...args) => mockCreateChatCompletion(...args),
}));
jest.mock('../observability/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const logger = require('../observability/logger');
const { buildAiEnhancedResponse } = require('../controllers/careerTools/aiEnhancement');

const USER_CONTENT = 'synthetic-user-job-description at Private Employer';
const AI_CONTENT = 'synthetic-ai-generated-skill';

const request = () => ({
  toolName: 'job_parser',
  input: { jobDescription: USER_CONTENT },
  baselineResponse: { requiredSkills: ['java'], summary: 'baseline summary' },
  requiredKeys: ['requiredSkills', 'summary'],
});

function completionWith(content) {
  return { choices: [{ message: { content } }] };
}

function loggedText() {
  return JSON.stringify([...logger.warn.mock.calls, ...logger.error.mock.calls, ...logger.info.mock.calls]);
}

describe('provider failure', () => {
  class ProviderError extends Error {
    constructor() {
      super('synthetic-provider-message for key sk-synthetic-key');
      this.status = 429;
      this.code = 'insufficient_quota';
      this.error = { message: 'synthetic-provider-inner-message' };
    }
  }

  test('logs tool name, code and status but not the provider message', async () => {
    mockCreateChatCompletion.mockRejectedValue(new ProviderError());
    const response = await buildAiEnhancedResponse(request());

    expect(response.aiEnhancementStatus).toBe('openai_error');
    expect(response).not.toHaveProperty('aiEnhancementErrorCode');
    expect(response).not.toHaveProperty('aiEnhancementHttpStatus');
    expect(JSON.stringify(response)).not.toContain('insufficient_quota');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { toolName: 'job_parser', errorCode: 'insufficient_quota', httpStatus: 429 },
      'OpenAI career tool enhancement failed',
    );
    const text = loggedText();
    expect(text).not.toContain('synthetic-provider');
    expect(text).not.toContain('sk-synthetic-key');
    expect(text).not.toContain(USER_CONTENT);
  });

  test('logs "unknown" and null for an error without code or status', async () => {
    mockCreateChatCompletion.mockRejectedValue(new Error('synthetic-network-message'));
    await buildAiEnhancedResponse(request());
    expect(logger.warn).toHaveBeenCalledWith(
      { toolName: 'job_parser', errorCode: 'unknown', httpStatus: null },
      'OpenAI career tool enhancement failed',
    );
    expect(loggedText()).not.toContain('synthetic-network-message');
  });
});

describe('invalid AI response', () => {
  test('a schema mismatch logs the reason and the invalid key names only', async () => {
    mockCreateChatCompletion.mockResolvedValue(completionWith(JSON.stringify({
      requiredSkills: AI_CONTENT,
      echoed: USER_CONTENT,
    })));
    const response = await buildAiEnhancedResponse(request());

    expect(response.aiEnhancementStatus).toBe('invalid_ai_json');
    expect(response.requiredSkills).toEqual(['java']);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { toolName: 'job_parser', reason: 'schema_mismatch', invalidKeys: ['requiredSkills', 'summary'] },
      'OpenAI career tool returned an invalid response',
    );
    const text = loggedText();
    expect(text).not.toContain(AI_CONTENT);
    expect(text).not.toContain(USER_CONTENT);
    expect(text).not.toContain('echoed');
  });

  test('unparseable content logs reason "unparseable" and no content', async () => {
    mockCreateChatCompletion.mockResolvedValue(completionWith(`not json: ${USER_CONTENT}`));
    const response = await buildAiEnhancedResponse(request());

    expect(response.aiEnhancementStatus).toBe('invalid_ai_json');
    expect(logger.warn).toHaveBeenCalledWith(
      { toolName: 'job_parser', reason: 'unparseable', invalidKeys: undefined },
      'OpenAI career tool returned an invalid response',
    );
    expect(loggedText()).not.toContain(USER_CONTENT);
  });

  test('a valid response logs nothing', async () => {
    mockCreateChatCompletion.mockResolvedValue(completionWith(JSON.stringify({
      requiredSkills: ['go'],
      summary: 'improved',
    })));
    const response = await buildAiEnhancedResponse(request());
    expect(response).toMatchObject({ requiredSkills: ['go'], summary: 'improved', aiEnhancementStatus: 'enhanced' });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
