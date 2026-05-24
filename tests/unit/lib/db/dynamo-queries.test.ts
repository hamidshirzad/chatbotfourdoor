import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock so it's available inside vi.mock factory
const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(function () { return { send: mockSend }; }),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mockSend })),
  },
  PutCommand: vi.fn(function (input: unknown) { this.input = input; }),
  GetCommand: vi.fn(function (input: unknown) { this.input = input; }),
  DeleteCommand: vi.fn(function (input: unknown) { this.input = input; }),
  QueryCommand: vi.fn(function (input: unknown) { this.input = input; }),
}));

vi.mock('@vercel/functions/oidc', () => ({
  awsCredentialsProvider: vi.fn(() => ({})),
}));

import {
  createPost,
  getPost,
  getFeed,
  getUserPosts,
  deletePost,
  followUser,
  unfollowUser,
  getFollowing,
  getFollowers,
  blockUser,
  unblockUser,
  likePost,
  unlikePost,
  getLikesForPost,
  addComment,
  getComments,
  deleteComment,
} from '@/lib/db/dynamo-queries';

const TABLE = 'test-table';

beforeEach(() => {
  vi.resetAllMocks();
  process.env.DYNAMODB_TABLE_NAME = TABLE;
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ROLE_ARN = 'arn:aws:iam::123:role/test';
});

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

describe('createPost', () => {
  it('writes a Post item with correct keys', async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await createPost('user-1', 'Hello world', ['img.jpg'], 'My caption');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.TableName).toBe(TABLE);
    expect(cmd.input.Item.PK).toBe('USER#user-1');
    expect(cmd.input.Item.content).toBe('Hello world');
    expect(cmd.input.Item.feedPartition).toBe('FEED');
    expect(result.userId).toBe('user-1');
    expect(result.mediaUrls).toEqual(['img.jpg']);
  });
});

describe('getPost', () => {
  it('calls GetCommand with correct key', async () => {
    mockSend.mockResolvedValueOnce({ Item: { postId: 'p1' } });
    const post = await getPost('user-1', 'p1', '2024-01-01T00:00:00.000Z');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Key.PK).toBe('USER#user-1');
    expect(post).toEqual({ postId: 'p1' });
  });

  it('returns null when item is not found', async () => {
    mockSend.mockResolvedValueOnce({});
    const post = await getPost('user-1', 'p1', '2024-01-01T00:00:00.000Z');
    expect(post).toBeNull();
  });
});

describe('getFeed', () => {
  it('queries gsi-feed index', async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ postId: 'p1' }] });
    const { items } = await getFeed(10);

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.IndexName).toBe('gsi-feed');
    expect(cmd.input.ScanIndexForward).toBe(false);
    expect(items).toHaveLength(1);
  });
});

describe('getUserPosts', () => {
  it('queries by USER# PK', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    await getUserPosts('user-1');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.ExpressionAttributeValues[':pk']).toBe('USER#user-1');
  });
});

describe('deletePost', () => {
  it('calls DeleteCommand with correct key', async () => {
    mockSend.mockResolvedValueOnce({});
    await deletePost('user-1', 'p1', '2024-01-01T00:00:00.000Z');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Key.PK).toBe('USER#user-1');
    expect(cmd.input.Key.SK).toContain('POST#');
  });
});

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

describe('followUser', () => {
  it('writes Follow item with correct GSI key', async () => {
    mockSend.mockResolvedValueOnce({});
    await followUser('follower-1', 'followee-2');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Item.PK).toBe('FOLLOWS#follower-1');
    expect(cmd.input.Item.SK).toBe('USER#followee-2');
    expect(cmd.input.Item.followeeKey).toBe('FOLLOWERS#followee-2');
  });
});

describe('unfollowUser', () => {
  it('deletes Follow item with correct key', async () => {
    mockSend.mockResolvedValueOnce({});
    await unfollowUser('follower-1', 'followee-2');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Key.PK).toBe('FOLLOWS#follower-1');
    expect(cmd.input.Key.SK).toBe('USER#followee-2');
  });
});

describe('getFollowing', () => {
  it('queries by FOLLOWS# PK', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    await getFollowing('user-1');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.ExpressionAttributeValues[':pk']).toBe('FOLLOWS#user-1');
  });
});

describe('getFollowers', () => {
  it('queries gsi-followers index', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    await getFollowers('user-1');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.IndexName).toBe('gsi-followers');
    expect(cmd.input.ExpressionAttributeValues[':fk']).toBe('FOLLOWERS#user-1');
  });
});

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

describe('blockUser', () => {
  it('writes Block item', async () => {
    mockSend.mockResolvedValueOnce({});
    await blockUser('blocker-1', 'blocked-2');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Item.PK).toBe('BLOCKS#blocker-1');
    expect(cmd.input.Item.SK).toBe('USER#blocked-2');
  });
});

describe('unblockUser', () => {
  it('deletes Block item', async () => {
    mockSend.mockResolvedValueOnce({});
    await unblockUser('blocker-1', 'blocked-2');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Key.PK).toBe('BLOCKS#blocker-1');
    expect(cmd.input.Key.SK).toBe('USER#blocked-2');
  });
});

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

describe('likePost', () => {
  it('writes Like item with correct keys', async () => {
    mockSend.mockResolvedValueOnce({});
    await likePost('user-1', 'post-1');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Item.PK).toBe('LIKES#post-1');
    expect(cmd.input.Item.SK).toBe('USER#user-1');
  });
});

describe('unlikePost', () => {
  it('deletes Like item', async () => {
    mockSend.mockResolvedValueOnce({});
    await unlikePost('user-1', 'post-1');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Key.PK).toBe('LIKES#post-1');
    expect(cmd.input.Key.SK).toBe('USER#user-1');
  });
});

describe('getLikesForPost', () => {
  it('queries by LIKES# PK', async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ userId: 'u1' }] });
    const likes = await getLikesForPost('post-1');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.ExpressionAttributeValues[':pk']).toBe('LIKES#post-1');
    expect(likes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

describe('addComment', () => {
  it('writes Comment item with correct keys', async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await addComment('user-1', 'post-1', 'Great post!');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Item.PK).toBe('COMMENTS#post-1');
    expect(cmd.input.Item.SK).toMatch(/^COMMENT#/);
    expect(cmd.input.Item.text).toBe('Great post!');
    expect(result.userId).toBe('user-1');
  });

  it('stores parentCommentId when provided', async () => {
    mockSend.mockResolvedValueOnce({});
    await addComment('user-1', 'post-1', 'Reply!', 'parent-comment-id');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Item.parentCommentId).toBe('parent-comment-id');
  });
});

describe('getComments', () => {
  it('queries by COMMENTS# PK sorted ascending', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    await getComments('post-1');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.ExpressionAttributeValues[':pk']).toBe('COMMENTS#post-1');
    expect(cmd.input.ScanIndexForward).toBe(true);
  });
});

describe('deleteComment', () => {
  it('deletes Comment item with correct composite SK', async () => {
    mockSend.mockResolvedValueOnce({});
    await deleteComment('post-1', 'comment-1', '2024-01-01T00:00:00.000Z');

    const [cmd] = mockSend.mock.calls[0];
    expect(cmd.input.Key.PK).toBe('COMMENTS#post-1');
    expect(cmd.input.Key.SK).toBe('COMMENT#2024-01-01T00:00:00.000Z#comment-1');
  });
});
