import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks must be declared before any imports from the module under test.
const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-bedrock-agent', () => ({
  BedrockAgentClient: vi.fn(function () { return { send: mockSend }; }),
  CreatePromptCommand: vi.fn(function (input: unknown) { this.input = input; }),
  GetPromptCommand: vi.fn(function (input: unknown) { this.input = input; }),
  ListPromptsCommand: vi.fn(function (input: unknown) { this.input = input; }),
  CreatePromptVersionCommand: vi.fn(function (input: unknown) { this.input = input; }),
  DeletePromptCommand: vi.fn(function (input: unknown) { this.input = input; }),
}));

import {
  createPrompt,
  getPrompt,
  listPrompts,
  createPromptVersion,
  deletePrompt,
  getSystemPromptText,
  fillVariables,
  clearPromptCache,
} from '@/lib/ai/bedrock-prompt-management';
import { systemPrompt } from '@/lib/ai/prompts-static';

beforeEach(() => {
  vi.resetAllMocks();
  clearPromptCache();
  delete process.env.BEDROCK_SYSTEM_PROMPT_ID;
});

// ---------------------------------------------------------------------------
// fillVariables
// ---------------------------------------------------------------------------

describe('fillVariables', () => {
  it('replaces known placeholders', () => {
    expect(fillVariables('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
  });

  it('leaves unknown placeholders intact', () => {
    expect(fillVariables('Hello {{name}}!', {})).toBe('Hello {{name}}!');
  });

  it('replaces multiple distinct placeholders', () => {
    expect(
      fillVariables('{{greeting}} {{name}}', { greeting: 'Hi', name: 'Claude' }),
    ).toBe('Hi Claude');
  });
});

// ---------------------------------------------------------------------------
// createPrompt
// ---------------------------------------------------------------------------

describe('createPrompt', () => {
  it('delegates to CreatePromptCommand and returns result', async () => {
    const fakeResult = { id: 'prompt-123', name: 'test' };
    mockSend.mockResolvedValueOnce(fakeResult);

    const result = await createPrompt({ name: 'test', variants: [] });

    expect(mockSend).toHaveBeenCalledOnce();
    expect(result).toEqual(fakeResult);
  });
});

// ---------------------------------------------------------------------------
// getPrompt
// ---------------------------------------------------------------------------

describe('getPrompt', () => {
  it('fetches the DRAFT when no version is provided', async () => {
    const fakeResult = { id: 'prompt-123', variants: [] };
    mockSend.mockResolvedValueOnce(fakeResult);

    const result = await getPrompt('prompt-123');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input).toEqual({ promptIdentifier: 'prompt-123', promptVersion: undefined });
    expect(result).toEqual(fakeResult);
  });

  it('fetches a specific version when provided', async () => {
    mockSend.mockResolvedValueOnce({ id: 'prompt-123', version: '1' });

    await getPrompt('prompt-123', '1');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.promptVersion).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// listPrompts
// ---------------------------------------------------------------------------

describe('listPrompts', () => {
  it('returns the promptSummaries array', async () => {
    const summaries = [{ id: 'a' }, { id: 'b' }];
    mockSend.mockResolvedValueOnce({ promptSummaries: summaries });

    const result = await listPrompts();
    expect(result).toEqual(summaries);
  });

  it('returns empty array when promptSummaries is absent', async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await listPrompts();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createPromptVersion
// ---------------------------------------------------------------------------

describe('createPromptVersion', () => {
  it('delegates to CreatePromptVersionCommand with description', async () => {
    mockSend.mockResolvedValueOnce({ version: '1' });

    const result = await createPromptVersion('prompt-123', 'v1 release');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input).toEqual({ promptIdentifier: 'prompt-123', description: 'v1 release' });
    expect(result).toEqual({ version: '1' });
  });

  it('omits description when not provided', async () => {
    mockSend.mockResolvedValueOnce({ version: '1' });
    await createPromptVersion('prompt-123');
    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deletePrompt
// ---------------------------------------------------------------------------

describe('deletePrompt', () => {
  it('delegates to DeletePromptCommand', async () => {
    mockSend.mockResolvedValueOnce({});
    await deletePrompt('prompt-123', '1');
    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input).toEqual({ promptIdentifier: 'prompt-123', promptVersion: '1' });
  });
});

// ---------------------------------------------------------------------------
// getSystemPromptText
// ---------------------------------------------------------------------------

describe('getSystemPromptText', () => {
  it('returns static fallback when BEDROCK_SYSTEM_PROMPT_ID is not set', async () => {
    const text = await getSystemPromptText();
    expect(text).toBe(systemPrompt);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('fetches from Bedrock and returns TEXT template text', async () => {
    process.env.BEDROCK_SYSTEM_PROMPT_ID = 'prompt-abc';
    mockSend.mockResolvedValueOnce({
      variants: [
        {
          templateType: 'TEXT',
          templateConfiguration: { text: { text: 'Fetched prompt text' } },
        },
      ],
    });

    const text = await getSystemPromptText();
    expect(text).toBe('Fetched prompt text');
  });

  it('fetches from Bedrock and returns CHAT system message text', async () => {
    process.env.BEDROCK_SYSTEM_PROMPT_ID = 'prompt-abc';
    mockSend.mockResolvedValueOnce({
      variants: [
        {
          templateType: 'CHAT',
          templateConfiguration: { chat: { system: [{ text: 'Chat system prompt' }] } },
        },
      ],
    });

    const text = await getSystemPromptText();
    expect(text).toBe('Chat system prompt');
  });

  it('uses cache on second call and only calls Bedrock once', async () => {
    process.env.BEDROCK_SYSTEM_PROMPT_ID = 'prompt-abc';
    mockSend.mockResolvedValue({
      variants: [
        {
          templateType: 'TEXT',
          templateConfiguration: { text: { text: 'Cached prompt' } },
        },
      ],
    });

    const first = await getSystemPromptText();
    const second = await getSystemPromptText();

    expect(mockSend).toHaveBeenCalledOnce();
    expect(first).toBe('Cached prompt');
    expect(second).toBe('Cached prompt');
  });

  it('returns static fallback when Bedrock throws', async () => {
    process.env.BEDROCK_SYSTEM_PROMPT_ID = 'prompt-abc';
    mockSend.mockRejectedValueOnce(new Error('Network error'));

    const text = await getSystemPromptText();
    expect(text).toBe(systemPrompt);
  });
});
