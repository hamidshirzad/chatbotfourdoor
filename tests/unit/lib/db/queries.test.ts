import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only so it doesn't throw outside a Next.js server context
vi.mock('server-only', () => ({}));

// Mock the postgres client constructor so no real DB connection is attempted
vi.mock('postgres', () => ({ default: vi.fn(() => ({})) }));

// vi.hoisted ensures mockDb is available inside the vi.mock factory, which is
// hoisted to the top of the file before any const declarations run.
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: () => mockDb,
}));

// Import after mocks are registered so the module picks them up
import {
  getUser,
  createUser,
  saveChat,
  deleteChatById,
  getChatsByUserId,
  getChatById,
  saveMessages,
  getMessagesByChatId,
  voteMessage,
  getVotesByChatId,
  saveDocument,
  getDocumentsById,
  getDocumentById,
  deleteDocumentsByIdAfterTimestamp,
  saveSuggestions,
  getSuggestionsByDocumentId,
} from '@/lib/db/queries';
import type { Message, Suggestion } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a select chain that resolves to `rows` at the end. */
function selectChain(rows: unknown[] = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockResolvedValue(rows);
  // Also make where() itself awaitable so queries without orderBy work
  chain.where.mockImplementation(() => ({
    orderBy: vi.fn().mockResolvedValue(rows),
    then: (res: (v: unknown) => void) => Promise.resolve(rows).then(res),
  }));
  return chain;
}

/** Returns a select chain where .where() resolves directly (no orderBy). */
function selectResolves(rows: unknown[] = []) {
  const chain = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  return chain;
}

/** Returns an insert chain that resolves on .values(). */
function insertChain(result: unknown = undefined) {
  return { values: vi.fn().mockResolvedValue(result) };
}

/** Returns a delete chain that resolves on .where(). */
function deleteChain(result: unknown = undefined) {
  return { where: vi.fn().mockResolvedValue(result) };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getUser
// ---------------------------------------------------------------------------

describe('getUser', () => {
  it('returns the matching user rows', async () => {
    const mockUser = { id: 'u1', email: 'alice@example.com', password: 'hash' };
    mockDb.select.mockReturnValue(selectResolves([mockUser]));

    const result = await getUser('alice@example.com');
    expect(result).toEqual([mockUser]);
  });

  it('returns an empty array when no user is found', async () => {
    mockDb.select.mockReturnValue(selectResolves([]));
    const result = await getUser('unknown@example.com');
    expect(result).toEqual([]);
  });

  it('rethrows errors from the database', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('db error')),
      }),
    });
    await expect(getUser('x@x.com')).rejects.toThrow('db error');
  });
});

// ---------------------------------------------------------------------------
// createUser
// ---------------------------------------------------------------------------

describe('createUser', () => {
  it('inserts a user and returns the result', async () => {
    const chain = insertChain({ rowCount: 1 });
    mockDb.insert.mockReturnValue(chain);

    await expect(
      createUser('bob@example.com', 'secret123'),
    ).resolves.toBeDefined();
    expect(chain.values).toHaveBeenCalledOnce();
  });

  it('hashes the password before inserting', async () => {
    const chain = insertChain();
    mockDb.insert.mockReturnValue(chain);

    await createUser('bob@example.com', 'plaintext');

    const [insertedRow] = chain.values.mock.calls[0];
    // The stored password must not equal the plain-text password
    expect(insertedRow.password).not.toBe('plaintext');
    // Must look like a bcrypt hash
    expect(insertedRow.password).toMatch(/^\$2[ab]\$/);
  });

  it('rethrows errors from the database', async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('insert error')),
    });
    await expect(createUser('x@x.com', 'pass')).rejects.toThrow('insert error');
  });
});

// ---------------------------------------------------------------------------
// saveChat
// ---------------------------------------------------------------------------

describe('saveChat', () => {
  it('inserts a chat with the provided fields', async () => {
    const chain = insertChain();
    mockDb.insert.mockReturnValue(chain);

    await saveChat({ id: 'chat-1', userId: 'u1', title: 'My Chat' });

    expect(chain.values).toHaveBeenCalledOnce();
    const [row] = chain.values.mock.calls[0];
    expect(row).toMatchObject({ id: 'chat-1', userId: 'u1', title: 'My Chat' });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('rethrows errors from the database', async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('save error')),
    });
    await expect(
      saveChat({ id: 'c', userId: 'u', title: 't' }),
    ).rejects.toThrow('save error');
  });
});

// ---------------------------------------------------------------------------
// deleteChatById
// ---------------------------------------------------------------------------

describe('deleteChatById', () => {
  it('deletes votes, messages, and the chat row', async () => {
    const delVote = deleteChain();
    const delMsg = deleteChain();
    const delChat = deleteChain();
    mockDb.delete
      .mockReturnValueOnce(delVote)
      .mockReturnValueOnce(delMsg)
      .mockReturnValueOnce(delChat);

    await deleteChatById({ id: 'chat-1' });

    expect(mockDb.delete).toHaveBeenCalledTimes(3);
    expect(delVote.where).toHaveBeenCalledOnce();
    expect(delMsg.where).toHaveBeenCalledOnce();
    expect(delChat.where).toHaveBeenCalledOnce();
  });

  it('deletes votes before messages (correct cascade order)', async () => {
    const callOrder: string[] = [];

    mockDb.delete.mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => {
        callOrder.push(`delete-${mockDb.delete.mock.calls.length}`);
        return Promise.resolve(undefined);
      }),
    }));

    await deleteChatById({ id: 'chat-1' });

    // Three deletions must occur in order: delete-1 (vote), delete-2 (message), delete-3 (chat)
    expect(callOrder).toEqual(['delete-1', 'delete-2', 'delete-3']);
  });

  it('rethrows errors from the database', async () => {
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockRejectedValue(new Error('delete error')),
    });
    await expect(deleteChatById({ id: 'c' })).rejects.toThrow('delete error');
  });
});

// ---------------------------------------------------------------------------
// getChatsByUserId
// ---------------------------------------------------------------------------

describe('getChatsByUserId', () => {
  it('returns chats ordered by createdAt descending', async () => {
    const chats = [
      { id: 'c2', createdAt: new Date('2024-06-01') },
      { id: 'c1', createdAt: new Date('2024-01-01') },
    ];
    mockDb.select.mockReturnValue(selectChain(chats));

    const result = await getChatsByUserId({ id: 'u1' });
    expect(result).toEqual(chats);
  });

  it('rethrows errors from the database', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockRejectedValue(new Error('fetch error')),
        }),
      }),
    });
    await expect(getChatsByUserId({ id: 'u1' })).rejects.toThrow('fetch error');
  });
});

// ---------------------------------------------------------------------------
// getChatById
// ---------------------------------------------------------------------------

describe('getChatById', () => {
  it('returns the chat when found', async () => {
    const chat = { id: 'c1', title: 'Hello' };
    mockDb.select.mockReturnValue(selectResolves([chat]));

    const result = await getChatById({ id: 'c1' });
    expect(result).toEqual(chat);
  });

  it('returns undefined when no chat is found', async () => {
    mockDb.select.mockReturnValue(selectResolves([]));
    const result = await getChatById({ id: 'not-found' });
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// saveMessages
// ---------------------------------------------------------------------------

describe('saveMessages', () => {
  it('inserts all provided messages', async () => {
    const chain = insertChain();
    mockDb.insert.mockReturnValue(chain);

    const messages: Message[] = [
      { id: 'm1', chatId: 'c1', role: 'user', content: 'hi', createdAt: new Date() },
      { id: 'm2', chatId: 'c1', role: 'assistant', content: 'hello', createdAt: new Date() },
    ];

    await saveMessages({ messages });
    expect(chain.values).toHaveBeenCalledWith(messages);
  });

  it('rethrows errors from the database', async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('save error')),
    });
    await expect(saveMessages({ messages: [] })).rejects.toThrow('save error');
  });
});

// ---------------------------------------------------------------------------
// getMessagesByChatId
// ---------------------------------------------------------------------------

describe('getMessagesByChatId', () => {
  it('returns messages in ascending order', async () => {
    const msgs = [
      { id: 'm1', createdAt: new Date('2024-01-01') },
      { id: 'm2', createdAt: new Date('2024-06-01') },
    ];
    mockDb.select.mockReturnValue(selectChain(msgs));

    const result = await getMessagesByChatId({ id: 'c1' });
    expect(result).toEqual(msgs);
  });
});

// ---------------------------------------------------------------------------
// voteMessage
// ---------------------------------------------------------------------------

describe('voteMessage', () => {
  it('inserts a new upvote when no existing vote is found', async () => {
    mockDb.select.mockReturnValue(selectResolves([]));
    const chain = insertChain();
    mockDb.insert.mockReturnValue(chain);

    await voteMessage({ chatId: 'c1', messageId: 'm1', type: 'up' });

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(chain.values).toHaveBeenCalledWith({
      chatId: 'c1',
      messageId: 'm1',
      isUpvoted: true,
    });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('inserts a new downvote when no existing vote is found', async () => {
    mockDb.select.mockReturnValue(selectResolves([]));
    const chain = insertChain();
    mockDb.insert.mockReturnValue(chain);

    await voteMessage({ chatId: 'c1', messageId: 'm1', type: 'down' });

    expect(chain.values).toHaveBeenCalledWith({
      chatId: 'c1',
      messageId: 'm1',
      isUpvoted: false,
    });
  });

  it('updates an existing vote instead of inserting', async () => {
    const existingVote = { chatId: 'c1', messageId: 'm1', isUpvoted: false };
    mockDb.select.mockReturnValue(selectResolves([existingVote]));

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    mockDb.update.mockReturnValue({ set: updateSet });

    await voteMessage({ chatId: 'c1', messageId: 'm1', type: 'up' });

    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(updateSet).toHaveBeenCalledWith({ isUpvoted: true });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('rethrows errors from the database', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('vote error')),
      }),
    });
    await expect(
      voteMessage({ chatId: 'c', messageId: 'm', type: 'up' }),
    ).rejects.toThrow('vote error');
  });
});

// ---------------------------------------------------------------------------
// getVotesByChatId
// ---------------------------------------------------------------------------

describe('getVotesByChatId', () => {
  it('returns votes for the given chat', async () => {
    const votes = [{ chatId: 'c1', messageId: 'm1', isUpvoted: true }];
    mockDb.select.mockReturnValue(selectResolves(votes));

    const result = await getVotesByChatId({ id: 'c1' });
    expect(result).toEqual(votes);
  });
});

// ---------------------------------------------------------------------------
// saveDocument
// ---------------------------------------------------------------------------

describe('saveDocument', () => {
  it('inserts a document with all provided fields and a createdAt timestamp', async () => {
    const chain = insertChain();
    mockDb.insert.mockReturnValue(chain);

    await saveDocument({ id: 'd1', title: 'Doc', content: 'body', userId: 'u1' });

    expect(chain.values).toHaveBeenCalledOnce();
    const [row] = chain.values.mock.calls[0];
    expect(row).toMatchObject({ id: 'd1', title: 'Doc', content: 'body', userId: 'u1' });
    expect(row.createdAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// getDocumentsById
// ---------------------------------------------------------------------------

describe('getDocumentsById', () => {
  it('returns all document versions ordered by createdAt ascending', async () => {
    const docs = [{ id: 'd1', createdAt: new Date('2024-01-01') }];
    mockDb.select.mockReturnValue(selectChain(docs));

    const result = await getDocumentsById({ id: 'd1' });
    expect(result).toEqual(docs);
  });
});

// ---------------------------------------------------------------------------
// getDocumentById
// ---------------------------------------------------------------------------

describe('getDocumentById', () => {
  it('returns the most recent document version', async () => {
    const doc = { id: 'd1', createdAt: new Date('2024-06-01') };
    mockDb.select.mockReturnValue(selectChain([doc]));

    const result = await getDocumentById({ id: 'd1' });
    expect(result).toEqual(doc);
  });

  it('returns undefined when no document is found', async () => {
    mockDb.select.mockReturnValue(selectChain([]));
    const result = await getDocumentById({ id: 'not-found' });
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteDocumentsByIdAfterTimestamp
// ---------------------------------------------------------------------------

describe('deleteDocumentsByIdAfterTimestamp', () => {
  it('deletes related suggestions before documents', async () => {
    const callOrder: string[] = [];

    mockDb.delete.mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => {
        callOrder.push(`delete-${mockDb.delete.mock.calls.length}`);
        return Promise.resolve(undefined);
      }),
    }));

    await deleteDocumentsByIdAfterTimestamp({
      id: 'd1',
      timestamp: new Date('2024-03-01'),
    });

    // Suggestions must be deleted first (index 1), then documents (index 2)
    expect(callOrder).toEqual(['delete-1', 'delete-2']);
    expect(mockDb.delete).toHaveBeenCalledTimes(2);
  });

  it('rethrows errors from the database', async () => {
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockRejectedValue(new Error('del error')),
    });
    await expect(
      deleteDocumentsByIdAfterTimestamp({ id: 'd', timestamp: new Date() }),
    ).rejects.toThrow('del error');
  });
});

// ---------------------------------------------------------------------------
// saveSuggestions
// ---------------------------------------------------------------------------

describe('saveSuggestions', () => {
  it('inserts all provided suggestions', async () => {
    const chain = insertChain();
    mockDb.insert.mockReturnValue(chain);

    const suggestions: Suggestion[] = [
      {
        id: 's1',
        documentId: 'd1',
        documentCreatedAt: new Date(),
        originalText: 'foo',
        suggestedText: 'bar',
        description: null,
        isResolved: false,
        userId: 'u1',
        createdAt: new Date(),
      },
    ];

    await saveSuggestions({ suggestions });
    expect(chain.values).toHaveBeenCalledWith(suggestions);
  });
});

// ---------------------------------------------------------------------------
// getSuggestionsByDocumentId
// ---------------------------------------------------------------------------

describe('getSuggestionsByDocumentId', () => {
  it('returns suggestions for the given document', async () => {
    const suggestions = [{ id: 's1', documentId: 'd1' }];
    mockDb.select.mockReturnValue(selectResolves(suggestions));

    const result = await getSuggestionsByDocumentId({ documentId: 'd1' });
    expect(result).toEqual(suggestions);
  });
});
