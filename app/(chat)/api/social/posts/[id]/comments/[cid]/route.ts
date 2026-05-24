import { auth } from '@/app/(auth)/auth';
import { deleteComment } from '@/lib/db/dynamo-queries';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: postId, cid: commentId } = await params;
  const { searchParams } = new URL(request.url);
  const createdAt = searchParams.get('createdAt') ?? '';

  try {
    await deleteComment(postId, commentId, createdAt);
    return new Response('Comment deleted', { status: 200 });
  } catch {
    return new Response('Failed to delete comment', { status: 500 });
  }
}
