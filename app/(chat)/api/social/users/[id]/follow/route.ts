import { auth } from '@/app/(auth)/auth';
import { followUser, unfollowUser } from '@/lib/db/dynamo-queries';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: followeeId } = await params;

  if (followeeId === session.user.id) {
    return new Response('Cannot follow yourself', { status: 400 });
  }

  try {
    await followUser(session.user.id, followeeId);
    return new Response('Followed', { status: 201 });
  } catch {
    return new Response('Failed to follow user', { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: followeeId } = await params;

  try {
    await unfollowUser(session.user.id, followeeId);
    return new Response('Unfollowed', { status: 200 });
  } catch {
    return new Response('Failed to unfollow user', { status: 500 });
  }
}
