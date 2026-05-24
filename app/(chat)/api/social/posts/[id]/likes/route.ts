import { auth } from '@/app/(auth)/auth';
import { likePost, unlikePost, getLikesForPost } from '@/lib/db/dynamo-queries';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: postId } = await params;

  try {
    const likes = await getLikesForPost(postId);
    return Response.json(likes);
  } catch {
    return new Response('Failed to fetch likes', { status: 500 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: postId } = await params;

  try {
    await likePost(session.user.id, postId);
    return new Response('Liked', { status: 201 });
  } catch {
    return new Response('Failed to like post', { status: 500 });
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

  const { id: postId } = await params;

  try {
    await unlikePost(session.user.id, postId);
    return new Response('Unliked', { status: 200 });
  } catch {
    return new Response('Failed to unlike post', { status: 500 });
  }
}
