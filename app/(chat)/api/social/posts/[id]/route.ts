import { auth } from '@/app/(auth)/auth';
import { getPost, deletePost } from '@/lib/db/dynamo-queries';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: postId } = await params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') ?? session.user.id;
  const createdAt = searchParams.get('createdAt') ?? '';

  try {
    const post = await getPost(userId, postId, createdAt);
    if (!post) return new Response('Not found', { status: 404 });
    return Response.json(post);
  } catch {
    return new Response('Failed to fetch post', { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: postId } = await params;
  const { searchParams } = new URL(request.url);
  const createdAt = searchParams.get('createdAt') ?? '';

  try {
    await deletePost(session.user.id, postId, createdAt);
    return new Response('Post deleted', { status: 200 });
  } catch {
    return new Response('Failed to delete post', { status: 500 });
  }
}
