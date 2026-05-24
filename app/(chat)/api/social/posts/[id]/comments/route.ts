import { auth } from '@/app/(auth)/auth';
import { addComment, getComments } from '@/lib/db/dynamo-queries';

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
    const comments = await getComments(postId);
    return Response.json(comments);
  } catch {
    return new Response('Failed to fetch comments', { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: postId } = await params;

  try {
    const { text, parentCommentId } = await request.json();
    if (!text) {
      return new Response('text is required', { status: 400 });
    }
    const comment = await addComment(session.user.id, postId, text, parentCommentId);
    return Response.json(comment, { status: 201 });
  } catch {
    return new Response('Failed to add comment', { status: 500 });
  }
}
