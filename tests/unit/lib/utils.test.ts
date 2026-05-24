import { describe, it, expect } from 'vitest';

import {
  cn,
  generateUUID,
  convertToUIMessages,
  sanitizeResponseMessages,
  sanitizeUIMessages,
  getMostRecentUserMessage,
  getDocumentTimestampByIndex,
  getMessageIdFromAnnotations,
} from '@/lib/utils';

import type { Message as DBMessage, Document } from '@/lib/db/schema';
import type { Message, CoreMessage } from 'ai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDBMessage(overrides: Partial<DBMessage> = {}): DBMessage {
  return {
    id: 'msg-1',
    chatId: 'chat-1',
    role: 'user',
    content: 'hello',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    createdAt: new Date('2024-01-01'),
    title: 'Test Doc',
    content: 'content',
    userId: 'user-1',
    ...overrides,
  };
}

function makeUIMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'hello',
    ...overrides,
  } as Message;
}

// ---------------------------------------------------------------------------
// cn
// ---------------------------------------------------------------------------

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('deduplicates conflicting Tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('ignores falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('handles conditional objects', () => {
    expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe(
      'text-red-500',
    );
  });

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateUUID
// ---------------------------------------------------------------------------

describe('generateUUID', () => {
  it('returns a string in UUID v4 format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('generates unique values on each call', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUUID()));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// convertToUIMessages
// ---------------------------------------------------------------------------

describe('convertToUIMessages', () => {
  it('returns empty array for empty input', () => {
    expect(convertToUIMessages([])).toEqual([]);
  });

  it('converts a plain user text message', () => {
    const input = [makeDBMessage({ role: 'user', content: 'hi there' })];
    const result = convertToUIMessages(input);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('msg-1');
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('hi there');
    expect(result[0].toolInvocations).toEqual([]);
  });

  it('converts an assistant message with string content', () => {
    const input = [
      makeDBMessage({ role: 'assistant', content: 'I can help with that.' }),
    ];
    const result = convertToUIMessages(input);

    expect(result[0].role).toBe('assistant');
    expect(result[0].content).toBe('I can help with that.');
  });

  it('converts an assistant message with array text content', () => {
    const input = [
      makeDBMessage({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
      }),
    ];
    const result = convertToUIMessages(input);

    expect(result[0].content).toBe('Hello world');
  });

  it('extracts tool-call items into toolInvocations', () => {
    const input = [
      makeDBMessage({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check the weather.' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'getWeather',
            args: { city: 'London' },
          },
        ],
      }),
    ];
    const result = convertToUIMessages(input);

    expect(result[0].content).toBe('Let me check the weather.');
    expect(result[0].toolInvocations).toHaveLength(1);
    expect(result[0].toolInvocations![0]).toMatchObject({
      state: 'call',
      toolCallId: 'call-1',
      toolName: 'getWeather',
      args: { city: 'London' },
    });
  });

  it('resolves tool results into preceding assistant message', () => {
    const messages: DBMessage[] = [
      makeDBMessage({
        id: 'msg-1',
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'getWeather',
            args: {},
          },
        ],
      }),
      makeDBMessage({
        id: 'msg-2',
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            result: { temp: '20°C' },
          },
        ],
      }),
    ];

    const result = convertToUIMessages(messages);

    // Tool message is not added as its own message
    expect(result).toHaveLength(1);
    expect(result[0].toolInvocations![0]).toMatchObject({
      state: 'result',
      toolCallId: 'call-1',
      result: { temp: '20°C' },
    });
  });

  it('leaves tool invocations without a result in call state', () => {
    const messages: DBMessage[] = [
      makeDBMessage({
        id: 'msg-1',
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'getWeather',
            args: {},
          },
        ],
      }),
    ];

    const result = convertToUIMessages(messages);
    expect(result[0].toolInvocations![0].state).toBe('call');
  });

  it('handles a tool result with no matching call gracefully', () => {
    const messages: DBMessage[] = [
      makeDBMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'hi',
      }),
      makeDBMessage({
        id: 'msg-2',
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-unknown',
            result: {},
          },
        ],
      }),
    ];

    // Should not throw; message has no toolInvocations to update
    const result = convertToUIMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('hi');
  });
});

// ---------------------------------------------------------------------------
// sanitizeResponseMessages
// ---------------------------------------------------------------------------

describe('sanitizeResponseMessages', () => {
  it('keeps tool-calls that have a matching tool-result', () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: [{ type: 'tool-call' as const, toolCallId: 'c1', toolName: 'fn', args: {} }],
      },
      {
        role: 'tool' as const,
        content: [{ type: 'tool-result' as const, toolCallId: 'c1', result: 'ok' }],
      },
    ];

    const result = sanitizeResponseMessages(messages);
    const assistant = result.find((m) => m.role === 'assistant')!;
    expect(Array.isArray(assistant.content)).toBe(true);
    expect((assistant.content as any[]).find((c) => c.toolCallId === 'c1')).toBeDefined();
  });

  it('removes tool-calls that have no matching tool-result', () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: [
          { type: 'tool-call' as const, toolCallId: 'c1', toolName: 'fn', args: {} },
          { type: 'tool-call' as const, toolCallId: 'c2', toolName: 'fn2', args: {} },
        ],
      },
      {
        role: 'tool' as const,
        content: [{ type: 'tool-result' as const, toolCallId: 'c1', result: 'ok' }],
      },
    ];

    const result = sanitizeResponseMessages(messages);
    const assistant = result.find((m) => m.role === 'assistant')!;
    const content = assistant.content as any[];
    expect(content.find((c) => c.toolCallId === 'c1')).toBeDefined();
    expect(content.find((c) => c.toolCallId === 'c2')).toBeUndefined();
  });

  it('removes empty text blocks', () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: [
          { type: 'text' as const, text: '' },
          { type: 'text' as const, text: 'hello' },
        ],
      },
    ];

    const result = sanitizeResponseMessages(messages);
    const content = (result[0].content as any[]);
    expect(content).toHaveLength(1);
    expect(content[0].text).toBe('hello');
  });

  it('removes assistant messages that have no content after sanitization', () => {
    const messages = [
      {
        role: 'assistant' as const,
        // tool-call with no matching result → gets filtered → empty content → message removed
        content: [{ type: 'tool-call' as const, toolCallId: 'c-orphan', toolName: 'fn', args: {} }],
      },
    ];

    const result = sanitizeResponseMessages(messages);
    expect(result).toHaveLength(0);
  });

  it('passes through tool messages unchanged', () => {
    const toolMsg = {
      role: 'tool' as const,
      content: [{ type: 'tool-result' as const, toolCallId: 'c1', result: 'data' }],
    };
    const result = sanitizeResponseMessages([toolMsg]);
    expect(result[0]).toEqual(toolMsg);
  });

  it('passes through assistant messages with string content unchanged', () => {
    const msg = { role: 'assistant' as const, content: 'plain text' };
    const result = sanitizeResponseMessages([msg]);
    expect(result[0]).toEqual(msg);
  });
});

// ---------------------------------------------------------------------------
// sanitizeUIMessages
// ---------------------------------------------------------------------------

describe('sanitizeUIMessages', () => {
  it('passes through non-assistant messages unchanged', () => {
    const msg = makeUIMessage({ role: 'user', content: 'hi' });
    expect(sanitizeUIMessages([msg])[0]).toEqual(msg);
  });

  it('passes through assistant messages with no toolInvocations unchanged', () => {
    const msg = makeUIMessage({ role: 'assistant', content: 'hello' });
    expect(sanitizeUIMessages([msg])[0]).toEqual(msg);
  });

  it('keeps result-state tool invocations', () => {
    const msg = makeUIMessage({
      role: 'assistant',
      content: '',
      toolInvocations: [
        { state: 'result', toolCallId: 'c1', toolName: 'fn', args: {}, result: 'ok' },
      ],
    });
    const result = sanitizeUIMessages([msg]);
    expect(result[0].toolInvocations).toHaveLength(1);
  });

  it('removes call-state tool invocations that have no result', () => {
    const msg = makeUIMessage({
      role: 'assistant',
      content: '',
      toolInvocations: [
        { state: 'call', toolCallId: 'c-no-result', toolName: 'fn', args: {} },
      ],
    });
    const result = sanitizeUIMessages([msg]);
    // message is also removed because content is empty and no remaining invocations
    expect(result).toHaveLength(0);
  });

  it('removes messages that have empty content and no tool invocations', () => {
    const msg = makeUIMessage({ role: 'assistant', content: '' });
    expect(sanitizeUIMessages([msg])).toHaveLength(0);
  });

  it('keeps messages that have empty content but have tool invocations', () => {
    const msg = makeUIMessage({
      role: 'assistant',
      content: '',
      toolInvocations: [
        { state: 'result', toolCallId: 'c1', toolName: 'fn', args: {}, result: 'ok' },
      ],
    });
    expect(sanitizeUIMessages([msg])).toHaveLength(1);
  });

  it('keeps messages that have content but no tool invocations', () => {
    const msg = makeUIMessage({ role: 'assistant', content: 'hello', toolInvocations: [] });
    expect(sanitizeUIMessages([msg])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getMostRecentUserMessage
// ---------------------------------------------------------------------------

describe('getMostRecentUserMessage', () => {
  it('returns undefined for an empty array', () => {
    expect(getMostRecentUserMessage([])).toBeUndefined();
  });

  it('returns the only user message', () => {
    const msg: CoreMessage = { role: 'user', content: 'hello' };
    expect(getMostRecentUserMessage([msg])).toEqual(msg);
  });

  it('returns the last user message when there are multiple', () => {
    const msgs: CoreMessage[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'second' },
    ];
    expect(getMostRecentUserMessage(msgs)).toEqual(msgs[2]);
  });

  it('returns undefined when there are no user messages', () => {
    const msgs: CoreMessage[] = [
      { role: 'assistant', content: 'hi' },
      { role: 'tool', content: [] },
    ];
    expect(getMostRecentUserMessage(msgs)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getDocumentTimestampByIndex
// ---------------------------------------------------------------------------

describe('getDocumentTimestampByIndex', () => {
  it('returns a new Date when documents is null/undefined', () => {
    // @ts-expect-error testing null guard
    const result = getDocumentTimestampByIndex(null, 0);
    expect(result).toBeInstanceOf(Date);
  });

  it('returns the createdAt of the document at the given index', () => {
    const ts = new Date('2024-06-01');
    const docs = [makeDocument({ createdAt: ts })];
    expect(getDocumentTimestampByIndex(docs, 0)).toBe(ts);
  });

  it('returns a new Date when index equals the array length (out of bounds)', () => {
    const docs = [makeDocument()];
    // index === docs.length is out of bounds; should return new Date()
    const result = getDocumentTimestampByIndex(docs, 1);
    expect(result).toBeInstanceOf(Date);
  });

  it('returns a new Date when index is greater than the array length', () => {
    const docs = [makeDocument()];
    const result = getDocumentTimestampByIndex(docs, 99);
    expect(result).toBeInstanceOf(Date);
  });

  it('returns correct timestamp for last element', () => {
    const ts1 = new Date('2024-01-01');
    const ts2 = new Date('2024-06-01');
    const docs = [makeDocument({ createdAt: ts1 }), makeDocument({ createdAt: ts2 })];
    expect(getDocumentTimestampByIndex(docs, 1)).toBe(ts2);
  });
});

// ---------------------------------------------------------------------------
// getMessageIdFromAnnotations
// ---------------------------------------------------------------------------

describe('getMessageIdFromAnnotations', () => {
  it('returns message.id when annotations is undefined', () => {
    const msg = makeUIMessage({ id: 'local-id', annotations: undefined });
    expect(getMessageIdFromAnnotations(msg)).toBe('local-id');
  });

  it('returns message.id when annotations array is empty', () => {
    const msg = makeUIMessage({ id: 'local-id', annotations: [] });
    expect(getMessageIdFromAnnotations(msg)).toBe('local-id');
  });

  it('returns messageIdFromServer when annotation has it', () => {
    const msg = makeUIMessage({
      id: 'local-id',
      annotations: [{ messageIdFromServer: 'server-id' } as any],
    });
    expect(getMessageIdFromAnnotations(msg)).toBe('server-id');
  });

  it('returns undefined when annotation has no messageIdFromServer', () => {
    const msg = makeUIMessage({
      id: 'local-id',
      annotations: [{ someOtherField: 'value' } as any],
    });
    // No messageIdFromServer → returns undefined
    expect(getMessageIdFromAnnotations(msg)).toBeUndefined();
  });
});
