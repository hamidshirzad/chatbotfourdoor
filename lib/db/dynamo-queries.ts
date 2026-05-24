import {
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import { docClient } from './dynamo';

const getTable = () => process.env.DYNAMODB_TABLE_NAME!;

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export async function createPost(
  userId: string,
  content: string,
  mediaUrls?: string[],
  caption?: string,
) {
  const postId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await docClient.send(
    new PutCommand({
      TableName: getTable(),
      Item: {
        PK: `USER#${userId}`,
        SK: `POST#${createdAt}#${postId}`,
        postId,
        userId,
        content,
        mediaUrls: mediaUrls ?? [],
        caption: caption ?? null,
        createdAt,
        feedPartition: 'FEED',
        feedSK: `${createdAt}#${postId}`,
      },
    }),
  );

  return { postId, userId, content, mediaUrls, caption, createdAt };
}

export async function getPost(userId: string, postId: string, createdAt: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTable(),
      Key: {
        PK: `USER#${userId}`,
        SK: `POST#${createdAt}#${postId}`,
      },
    }),
  );
  return result.Item ?? null;
}

export async function getUserPosts(
  userId: string,
  limit = 20,
  lastKey?: Record<string, unknown>,
) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTable(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':prefix': 'POST#',
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: lastKey,
    }),
  );
  return { items: result.Items ?? [], lastKey: result.LastEvaluatedKey };
}

export async function getFeed(limit = 20, lastKey?: Record<string, unknown>) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTable(),
      IndexName: 'gsi-feed',
      KeyConditionExpression: 'feedPartition = :fp',
      ExpressionAttributeValues: { ':fp': 'FEED' },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: lastKey,
    }),
  );
  return { items: result.Items ?? [], lastKey: result.LastEvaluatedKey };
}

export async function deletePost(userId: string, postId: string, createdAt: string) {
  await docClient.send(
    new DeleteCommand({
      TableName: getTable(),
      Key: {
        PK: `USER#${userId}`,
        SK: `POST#${createdAt}#${postId}`,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

export async function followUser(followerId: string, followeeId: string) {
  const createdAt = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: getTable(),
      Item: {
        PK: `FOLLOWS#${followerId}`,
        SK: `USER#${followeeId}`,
        followerId,
        followeeId,
        createdAt,
        followeeKey: `FOLLOWERS#${followeeId}`,
      },
    }),
  );
}

export async function unfollowUser(followerId: string, followeeId: string) {
  await docClient.send(
    new DeleteCommand({
      TableName: getTable(),
      Key: {
        PK: `FOLLOWS#${followerId}`,
        SK: `USER#${followeeId}`,
      },
    }),
  );
}

export async function getFollowing(userId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTable(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `FOLLOWS#${userId}` },
    }),
  );
  return result.Items ?? [];
}

export async function getFollowers(userId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTable(),
      IndexName: 'gsi-followers',
      KeyConditionExpression: 'followeeKey = :fk',
      ExpressionAttributeValues: { ':fk': `FOLLOWERS#${userId}` },
      ScanIndexForward: false,
    }),
  );
  return result.Items ?? [];
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export async function blockUser(blockerId: string, blockedId: string) {
  await docClient.send(
    new PutCommand({
      TableName: getTable(),
      Item: {
        PK: `BLOCKS#${blockerId}`,
        SK: `USER#${blockedId}`,
        blockerId,
        blockedId,
        createdAt: new Date().toISOString(),
      },
    }),
  );
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await docClient.send(
    new DeleteCommand({
      TableName: getTable(),
      Key: {
        PK: `BLOCKS#${blockerId}`,
        SK: `USER#${blockedId}`,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

export async function likePost(userId: string, postId: string) {
  await docClient.send(
    new PutCommand({
      TableName: getTable(),
      Item: {
        PK: `LIKES#${postId}`,
        SK: `USER#${userId}`,
        userId,
        postId,
        createdAt: new Date().toISOString(),
      },
    }),
  );
}

export async function unlikePost(userId: string, postId: string) {
  await docClient.send(
    new DeleteCommand({
      TableName: getTable(),
      Key: {
        PK: `LIKES#${postId}`,
        SK: `USER#${userId}`,
      },
    }),
  );
}

export async function getLikesForPost(postId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTable(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `LIKES#${postId}` },
    }),
  );
  return result.Items ?? [];
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addComment(
  userId: string,
  postId: string,
  text: string,
  parentCommentId?: string,
) {
  const commentId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await docClient.send(
    new PutCommand({
      TableName: getTable(),
      Item: {
        PK: `COMMENTS#${postId}`,
        SK: `COMMENT#${createdAt}#${commentId}`,
        commentId,
        postId,
        userId,
        text,
        parentCommentId: parentCommentId ?? null,
        createdAt,
      },
    }),
  );

  return { commentId, postId, userId, text, parentCommentId, createdAt };
}

export async function getComments(postId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTable(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `COMMENTS#${postId}` },
      ScanIndexForward: true,
    }),
  );
  return result.Items ?? [];
}

export async function deleteComment(
  postId: string,
  commentId: string,
  createdAt: string,
) {
  await docClient.send(
    new DeleteCommand({
      TableName: getTable(),
      Key: {
        PK: `COMMENTS#${postId}`,
        SK: `COMMENT#${createdAt}#${commentId}`,
      },
    }),
  );
}
